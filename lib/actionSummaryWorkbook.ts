// ---------------------------------------------------------------------------
// The Excel workbook attached to the action items summary.
//
// ExcelJS, not SheetJS: the community build of SheetJS (xlsx@0.18) writes no
// styles at all, so every fill, font and border here would silently vanish.
//
// 🔴 The colours on the ETA are CONDITIONAL FORMATTING keyed on TODAY(), not
// fills baked in at send time. A workbook opened a week after it arrived must
// not show an action as "due soon" that is now four days late. "Days to ETA"
// and "Health" are formulas for the same reason, written with their value as
// of sending so a previewer that does not calculate (Gmail, a phone) still
// shows a number.
//
// Server only: exceljs is a Node library.
// ---------------------------------------------------------------------------

import ExcelJS from "exceljs";
import type { SchoolBranding } from "./branding";
import {
  HEALTH_LABELS,
  byOwner,
  countRows,
  type SummaryRow,
} from "./actionSummary";

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase().padEnd(6, "0").slice(0, 6)}`;

// One palette, used by both the fills and the legend that explains them.
const C = {
  overdueFill: "FEE2E2",
  overdueText: "B91C1C",
  overdueStrong: "DC2626",
  soonFill: "FFEDD5",
  soonText: "C2410C",
  soonStrong: "F97316",
  okText: "047857",
  okStrong: "10B981",
  noDateText: "6B7280",
  noDateStrong: "9CA3AF",
  border: "E5E7EB",
  zebra: "F9FAFB",
  muted: "6B7280",
  ink: "111827",
};

const STATUS_STYLE: Record<SummaryRow["statusKey"], { fill: string; text: string }> = {
  blocked: { fill: "FEE2E2", text: "B91C1C" },
  not_started: { fill: "F3F4F6", text: "4B5563" },
  in_progress: { fill: "FEF3C7", text: "B45309" },
  done: { fill: "D1FAE5", text: "047857" },
  cancelled: { fill: "F3F4F6", text: "9CA3AF" },
};

const PRIORITY_STYLE: Record<SummaryRow["priorityKey"], { fill: string; text: string }> = {
  high: { fill: "FEE2E2", text: "B91C1C" },
  medium: { fill: "FEF3C7", text: "B45309" },
  low: { fill: "F3F4F6", text: "4B5563" },
};

const solid = (hex: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: argb(hex) } });
const thin = (hex: string): Partial<ExcelJS.Borders> => {
  const side = { style: "thin" as const, color: { argb: argb(hex) } };
  return { top: side, left: side, bottom: side, right: side };
};

/** An Excel date serial for YYYY-MM-DD, so the cell sorts and filters as a
 *  date and TODAY() can be compared with it. */
function excelDate(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface SummaryWorkbookInput {
  branding: SchoolBranding;
  rows: SummaryRow[];
  dueSoonDays: number;
  /** YYYY-MM-DD, the day it was built. */
  asOf: string;
  /** "Every Monday at 07:00", for the summary sheet. Blank on a one-off. */
  scheduleText?: string;
}

// Column letters are referenced by the formulas and the conditional formats,
// so they are derived from this list rather than typed out twice.
const COLUMNS = [
  { key: "ref", header: "Ref", width: 9 },
  { key: "title", header: "Action", width: 42 },
  { key: "health", header: "Health", width: 12 },
  { key: "dueDate", header: "ETA", width: 13 },
  { key: "daysLeft", header: "Days to ETA", width: 12 },
  { key: "owners", header: "Person responsible", width: 26 },
  { key: "progress", header: "Progress", width: 14 },
  { key: "status", header: "Status", width: 14 },
  { key: "priority", header: "Priority", width: 10 },
  { key: "category", header: "Category", width: 16 },
  { key: "latestNote", header: "Latest update", width: 46 },
  { key: "latestNoteOn", header: "Updated on", width: 13 },
  { key: "description", header: "Description", width: 46 },
  { key: "raisedBy", header: "Raised by", width: 20 },
  { key: "raisedOn", header: "Raised on", width: 13 },
  { key: "fromMeeting", header: "From meeting", width: 30 },
] as const;

const col = (key: (typeof COLUMNS)[number]["key"]) =>
  String.fromCharCode(65 + COLUMNS.findIndex((c) => c.key === key));

export async function buildSummaryWorkbook(input: SummaryWorkbookInput): Promise<Buffer> {
  const { branding: b, rows, dueSoonDays, asOf } = input;
  const PRIMARY = b.colors.primary;
  const counts = countRows(rows);

  const wb = new ExcelJS.Workbook();
  wb.creator = b.fullName;
  wb.created = new Date(`${asOf}T05:00:00Z`);

  // --- Sheet 1: Summary --------------------------------------------------------
  const sum = wb.addWorksheet("Summary", {
    views: [{ showGridLines: false }],
    properties: { tabColor: { argb: argb(PRIMARY) } },
  });
  sum.columns = [{ width: 3 }, { width: 30 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 3 }];

  sum.mergeCells("B2:E2");
  const title = sum.getCell("B2");
  title.value = `${b.fullName}: open action items`;
  title.font = { size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  title.fill = solid(PRIMARY);
  title.alignment = { vertical: "middle", indent: 1 };
  sum.getRow(2).height = 36;

  sum.mergeCells("B3:E3");
  const sub = sum.getCell("B3");
  sub.value = `As at ${formatLong(asOf)}${input.scheduleText ? `  ·  ${input.scheduleText}` : ""}`;
  sub.font = { size: 10, color: { argb: argb(C.muted) } };
  sub.alignment = { indent: 1 };

  // Headline numbers, one tile per figure.
  const tiles: { label: string; value: number; colour: string }[] = [
    { label: "Open", value: counts.open, colour: PRIMARY },
    { label: "Overdue", value: counts.overdue, colour: counts.overdue ? C.overdueStrong : C.noDateStrong },
    { label: `Due in ${dueSoonDays} days`, value: counts.dueSoon, colour: counts.dueSoon ? C.soonStrong : C.noDateStrong },
    { label: "Blocked", value: counts.blocked, colour: counts.blocked ? C.overdueStrong : C.noDateStrong },
  ];
  // Two rows of two, so the tiles sit inside the four columns B-E.
  tiles.forEach((t, i) => {
    const r = 5 + Math.floor(i / 2) * 3;
    const c = i % 2 === 0 ? ["B", "C"] : ["D", "E"];
    sum.mergeCells(`${c[0]}${r}:${c[1]}${r}`);
    sum.mergeCells(`${c[0]}${r + 1}:${c[1]}${r + 1}`);
    const v = sum.getCell(`${c[0]}${r}`);
    v.value = t.value;
    v.font = { size: 26, bold: true, color: { argb: argb(t.colour) } };
    v.alignment = { horizontal: "center", vertical: "middle" };
    const l = sum.getCell(`${c[0]}${r + 1}`);
    l.value = t.label;
    l.font = { size: 10, bold: true, color: { argb: argb(C.muted) } };
    l.alignment = { horizontal: "center" };
    for (const rr of [r, r + 1]) {
      for (const cc of c) {
        const cell = sum.getCell(`${cc}${rr}`);
        cell.fill = solid("F9FAFB");
      }
    }
    sum.getRow(r).height = 40;
  });

  // What the colours mean, so nobody has to guess.
  let r = 12;
  sum.getCell(`B${r}`).value = "What the colours mean";
  sum.getCell(`B${r}`).font = { bold: true, size: 12, color: { argb: argb(C.ink) } };
  r++;
  const legend: [string, string, string][] = [
    ["Overdue", "The ETA has passed", C.overdueFill],
    ["Due soon", `ETA within ${dueSoonDays} days`, C.soonFill],
    ["On track", "ETA further out", "FFFFFF"],
    ["No ETA", "No date set, so it cannot be chased", "F3F4F6"],
  ];
  for (const [label, meaning, fill] of legend) {
    const a = sum.getCell(`B${r}`);
    a.value = label;
    a.fill = solid(fill);
    a.border = thin(C.border);
    a.font = { bold: true, color: { argb: argb(label === "Overdue" ? C.overdueText : label === "Due soon" ? C.soonText : C.ink) } };
    sum.mergeCells(`C${r}:E${r}`);
    sum.getCell(`C${r}`).value = meaning;
    sum.getCell(`C${r}`).font = { color: { argb: argb(C.muted) } };
    r++;
  }
  sum.getCell(`B${r}`).value =
    "The colours follow today's date in Excel, so they stay right whenever the file is opened.";
  sum.getCell(`B${r}`).font = { italic: true, size: 9, color: { argb: argb(C.muted) } };
  r += 2;

  // Per person.
  sum.getCell(`B${r}`).value = "By person responsible";
  sum.getCell(`B${r}`).font = { bold: true, size: 12, color: { argb: argb(C.ink) } };
  r++;
  const head = sum.getRow(r);
  ["Person", "Open", "Overdue", "Due soon"].forEach((h, i) => {
    const cell = head.getCell(2 + i);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = solid(PRIMARY);
    cell.alignment = { horizontal: i ? "center" : "left", indent: i ? 0 : 1 };
  });
  r++;
  for (const [i, o] of byOwner(rows).entries()) {
    const row = sum.getRow(r);
    row.getCell(2).value = o.owner;
    row.getCell(2).alignment = { indent: 1 };
    row.getCell(3).value = o.open;
    row.getCell(4).value = o.overdue;
    row.getCell(5).value = o.dueSoon;
    for (let c = 2; c <= 5; c++) {
      const cell = row.getCell(c);
      cell.border = { bottom: { style: "thin", color: { argb: argb(C.border) } } };
      if (i % 2) cell.fill = solid(C.zebra);
      if (c > 2) cell.alignment = { horizontal: "center" };
    }
    if (o.overdue) row.getCell(4).font = { bold: true, color: { argb: argb(C.overdueText) } };
    if (o.dueSoon) row.getCell(5).font = { bold: true, color: { argb: argb(C.soonText) } };
    r++;
  }
  if (rows.length === 0) {
    sum.getCell(`B${r}`).value = "No open action items.";
    sum.getCell(`B${r}`).font = { italic: true, color: { argb: argb(C.muted) } };
  }

  // --- Sheet 2: the register ---------------------------------------------------
  const ws = wb.addWorksheet("Open action items", {
    // Header row and Ref + Action frozen, the same as the grid in the portal.
    views: [{ state: "frozen", xSplit: 2, ySplit: 1, showGridLines: false }],
    properties: { tabColor: { argb: argb(C.overdueStrong) } },
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  ws.columns = COLUMNS.map((c) => ({ key: c.key, header: c.header, width: c.width }));

  const header = ws.getRow(1);
  header.height = 26;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = solid(PRIMARY);
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = thin(PRIMARY);
  });

  const E = col("dueDate");

  rows.forEach((row, i) => {
    const n = i + 2;
    const due = excelDate(row.dueDate);
    const r = ws.addRow({
      ref: row.ref,
      title: row.title,
      // Live formulas, with the value as of sending cached for previewers.
      health: {
        formula: `IF(${E}${n}="","${HEALTH_LABELS.no_date}",IF(${E}${n}<TODAY(),"${HEALTH_LABELS.overdue}",IF(${E}${n}<=TODAY()+${dueSoonDays},"${HEALTH_LABELS.due_soon}","${HEALTH_LABELS.on_track}")))`,
        result: HEALTH_LABELS[row.health],
      },
      dueDate: due,
      daysLeft: {
        formula: `IF(${E}${n}="","",${E}${n}-TODAY())`,
        result: row.daysLeft === null ? "" : row.daysLeft,
      },
      owners: row.owners || "Nobody assigned",
      progress: row.progress / 100,
      status: row.status,
      priority: row.priority,
      category: row.category,
      latestNote: row.latestNote ? (row.latestNoteBy ? `${row.latestNote} (${row.latestNoteBy})` : row.latestNote) : "",
      latestNoteOn: excelDate(row.latestNoteOn),
      description: row.description,
      raisedBy: row.raisedBy,
      raisedOn: excelDate(row.raisedOn),
      fromMeeting: row.fromMeeting,
    });

    r.alignment = { vertical: "top", wrapText: true };
    r.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { bottom: { style: "thin", color: { argb: argb(C.border) } } };
      cell.font = { color: { argb: argb(C.ink) }, size: 10 };
    });
    r.getCell("ref").font = { bold: true, size: 10, color: { argb: argb(C.ink) } };
    r.getCell("title").font = { bold: true, size: 10, color: { argb: argb(C.ink) } };
    if (!row.owners) r.getCell("owners").font = { italic: true, size: 10, color: { argb: argb(C.overdueText) } };

    // Status and priority never change with the calendar, so they are plain
    // fills. They sit outside the conditional-format ranges below, so the row
    // tint never paints over them.
    const st = STATUS_STYLE[row.statusKey] ?? STATUS_STYLE.not_started;
    r.getCell("status").fill = solid(st.fill);
    r.getCell("status").font = { bold: true, size: 10, color: { argb: argb(st.text) } };
    r.getCell("status").alignment = { horizontal: "center", vertical: "top" };
    const pr = PRIORITY_STYLE[row.priorityKey] ?? PRIORITY_STYLE.low;
    r.getCell("priority").fill = solid(pr.fill);
    r.getCell("priority").font = { bold: true, size: 10, color: { argb: argb(pr.text) } };
    r.getCell("priority").alignment = { horizontal: "center", vertical: "top" };

    r.getCell("health").alignment = { horizontal: "center", vertical: "top" };
    r.getCell("health").font = { bold: true, size: 10 };
    for (const k of ["dueDate", "latestNoteOn", "raisedOn"] as const) {
      r.getCell(k).numFmt = "d mmm yyyy";
      r.getCell(k).alignment = { horizontal: "left", vertical: "top" };
    }
    r.getCell("daysLeft").numFmt = '+0;-0;"Today"';
    r.getCell("daysLeft").alignment = { horizontal: "center", vertical: "top" };
    r.getCell("progress").numFmt = "0%";
    r.getCell("progress").alignment = { horizontal: "left", vertical: "top" };
  });

  const last = rows.length + 1;
  if (rows.length) {
    ws.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + COLUMNS.length)}1` };

    // The row tint covers everything EXCEPT the cells carrying their own
    // colour (Health, Progress, Status, Priority).
    const tintRanges = [
      `A2:B${last}`,
      `${col("dueDate")}2:${col("owners")}${last}`,
      `${col("category")}2:${String.fromCharCode(64 + COLUMNS.length)}${last}`,
    ].join(" ");
    const overdue = `AND($${E}2<>"",$${E}2<TODAY())`;
    const soon = `AND($${E}2<>"",$${E}2>=TODAY(),$${E}2<=TODAY()+${dueSoonDays})`;

    ws.addConditionalFormatting({
      ref: tintRanges,
      rules: [
        { type: "expression", priority: 1, formulae: [overdue], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: argb(C.overdueFill) } } } },
        { type: "expression", priority: 2, formulae: [soon], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: argb(C.soonFill) } } } },
      ],
    });

    // The ETA and its countdown in strong colour on top of the tint.
    ws.addConditionalFormatting({
      ref: `${col("dueDate")}2:${col("daysLeft")}${last}`,
      rules: [
        { type: "expression", priority: 3, formulae: [overdue], style: { font: { bold: true, color: { argb: argb(C.overdueText) } } } },
        { type: "expression", priority: 4, formulae: [soon], style: { font: { bold: true, color: { argb: argb(C.soonText) } } } },
      ],
    });

    // Health as a solid pill: red, orange, green, grey.
    const H = col("health");
    const pill = (text: string, fill: string, priority: number): ExcelJS.ConditionalFormattingRule => ({
      type: "expression",
      priority,
      formulae: [`$${H}2="${text}"`],
      style: {
        fill: { type: "pattern", pattern: "solid", bgColor: { argb: argb(fill) } },
        font: { bold: true, color: { argb: "FFFFFFFF" } },
      },
    });
    ws.addConditionalFormatting({
      ref: `${H}2:${H}${last}`,
      rules: [
        pill(HEALTH_LABELS.overdue, C.overdueStrong, 5),
        pill(HEALTH_LABELS.due_soon, C.soonStrong, 6),
        pill(HEALTH_LABELS.on_track, C.okStrong, 7),
        pill(HEALTH_LABELS.no_date, C.noDateStrong, 8),
      ],
    });

    // Progress as a bar inside the cell.
    ws.addConditionalFormatting({
      ref: `${col("progress")}2:${col("progress")}${last}`,
      rules: [
        {
          type: "dataBar",
          priority: 9,
          gradient: false,
          cfvo: [
            { type: "num", value: 0 },
            { type: "num", value: 1 },
          ],
          color: { argb: argb(PRIMARY) },
        } as ExcelJS.ConditionalFormattingRule,
      ],
    });
  } else {
    ws.getCell("A2").value = "No open action items.";
    ws.getCell("A2").font = { italic: true, color: { argb: argb(C.muted) } };
  }

  // Excel opens on the register, which is what people came for; the summary
  // is one tab to the left.
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 1, visibility: "visible" }];

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

function formatLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function summaryFilename(shortName: string, asOf: string): string {
  return `${shortName} action items ${asOf}.xlsx`;
}
