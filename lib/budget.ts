// The yearly budget. Client-safe, every total derived here and never stored.
// Schools share this shape and differ only in their lines. Each centre (School,
// Grade R) has its own lines, and the combined view adds them up.

export type BudgetKind = "income" | "expense";

export interface BudgetItem {
  label: string;
  amount: number;
}

export interface BudgetLine {
  id: string;
  centre: string;
  kind: BudgetKind;
  group: string;
  code: string;
  name: string;
  /** Actual for the year before, usually year to date when the budget is drawn up. */
  actual: number;
  /** What was budgeted for the year before. */
  lastBudget: number;
  amount: number;
  note: string;
  /** When there are any, they add up to the line and amount is ignored. */
  items: BudgetItem[];
}

export interface Centre {
  id: string;
  name: string;
}

/** Fee × learners, per centre. Fees are set as a monthly amount, so it rounds per month. */
export interface FeePlan {
  centre: string;
  lastFee: number;
  months: number;
  roundTo: number;
  learners: number;
  /** The fee put on a line. A copied budget starts from this, the fee really charged. */
  chosenFee?: number;
}

export interface BudgetYear {
  year: number;
  centres: Centre[];
  lines: BudgetLine[];
  fees: FeePlan[];
  approved?: { date: string; by: string; note: string };
}

export const emptyBudget = (year: number): BudgetYear => ({ year, centres: [{ id: "main", name: "School" }], lines: [], fees: [] });

export const emptyFeePlan = (centre: string): FeePlan => ({ centre, lastFee: 0, months: 11, roundTo: 10, learners: 0 });

export const lineAmount = (l: Pick<BudgetLine, "amount" | "items">) => (l.items.length ? l.items.reduce((sum, i) => sum + i.amount, 0) : l.amount);

export function totals(lines: BudgetLine[]) {
  const sum = (kind: BudgetKind, of: (l: BudgetLine) => number) => lines.filter((l) => l.kind === kind).reduce((n, l) => n + of(l), 0);
  const income = sum("income", lineAmount);
  const expense = sum("expense", lineAmount);
  return { income, expense, surplus: income - expense, lastIncome: sum("income", (l) => l.lastBudget), lastExpense: sum("expense", (l) => l.lastBudget) };
}

export interface BudgetGroup {
  name: string;
  lines: BudgetLine[];
  actual: number;
  lastBudget: number;
  amount: number;
}

/** In first-seen order, which is the order of the school's own chart of accounts. */
export function byGroup(lines: BudgetLine[]): BudgetGroup[] {
  const groups = new Map<string, BudgetGroup>();
  for (const l of lines) {
    const g = groups.get(l.group) ?? { name: l.group, lines: [], actual: 0, lastBudget: 0, amount: 0 };
    g.lines.push(l);
    g.actual += l.actual;
    g.lastBudget += l.lastBudget;
    g.amount += lineAmount(l);
    groups.set(l.group, g);
  }
  return [...groups.values()];
}

/** Next year's fee: the increase is applied, then the MONTHLY amount is rounded, as schools publish it. */
export function feeAfter(p: Pick<FeePlan, "lastFee" | "months" | "roundTo">, increase: number) {
  const months = Math.max(1, p.months);
  const step = p.roundTo > 0 ? p.roundTo : 1;
  return (Math.round((p.lastFee * (1 + increase / 100)) / months / step) * step * months);
}

const text = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const money = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && Math.abs(n) < 1e11 ? Math.round(n * 100) / 100 : 0;
};

/** A line from outside, or a message saying what is wrong with it. */
export function cleanLine(b: Record<string, unknown>, centres: Centre[]): Omit<BudgetLine, "id"> | string {
  const name = text(b.name);
  const group = text(b.group);
  if (!name) return "Give the line a name.";
  if (!group) return "Choose a group for the line.";
  if (b.kind !== "income" && b.kind !== "expense") return "Choose income or spending.";
  if (!centres.some((c) => c.id === b.centre)) return "Choose where this line belongs.";
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 200).flatMap((i: { label?: unknown; amount?: unknown }) => {
    const label = text(i?.label);
    return label ? [{ label, amount: money(i?.amount) }] : [];
  });
  return { centre: b.centre as string, kind: b.kind, group, code: text(b.code, 20), name, actual: money(b.actual), lastBudget: money(b.lastBudget), amount: money(b.amount), note: text(b.note, 500), items };
}

export function cleanFee(b: Record<string, unknown>, centres: Centre[]): FeePlan | null {
  if (!centres.some((c) => c.id === b.centre)) return null;
  const whole = (v: unknown, min: number, fallback: number) => {
    const n = Math.round(money(v));
    return n >= min ? n : fallback;
  };
  return { centre: b.centre as string, lastFee: Math.max(0, money(b.lastFee)), months: Math.min(12, whole(b.months, 1, 11)), roundTo: whole(b.roundTo, 1, 1), learners: whole(b.learners, 0, 0), ...(money(b.chosenFee) > 0 ? { chosenFee: money(b.chosenFee) } : {}) };
}

/** A starting list for a school with no spreadsheet. Every line can be renamed or removed. */
export const STARTER: { kind: BudgetKind; group: string; lines: string[] }[] = [
  { kind: "income", group: "School Fees", lines: ["School fees", "Early payment discount", "Sibling discount"] },
  { kind: "income", group: "Grants", lines: ["State allocation"] },
  { kind: "income", group: "Sales", lines: ["Uniform sales"] },
  { kind: "income", group: "Fundraising", lines: ["Donations", "Fundraising events"] },
  { kind: "income", group: "Rental Income", lines: ["Hiring of facilities"] },
  { kind: "income", group: "Other Income", lines: ["Interest"] },
  { kind: "expense", group: "Administration", lines: ["Audit fees", "Bank charges", "Insurance", "Legal fees", "Printing and stationery", "Telephone and internet"] },
  { kind: "expense", group: "Educational Expenses", lines: ["Teaching materials", "Learner support", "Staff development"] },
  { kind: "expense", group: "Information Technology", lines: ["Software and licences", "Computers and equipment", "Support contracts"] },
  { kind: "expense", group: "Readers and Textbooks", lines: ["Textbooks", "Readers"] },
  { kind: "expense", group: "Extra Murals", lines: ["Sport", "Arts and culture"] },
  { kind: "expense", group: "Library", lines: ["Books"] },
  { kind: "expense", group: "Maintenance", lines: ["Buildings", "Grounds", "Electrical and plumbing"] },
  { kind: "expense", group: "Salaries", lines: ["SGB or Board teachers", "Administrative staff", "Grounds staff", "Section 38A payments"] },
  { kind: "expense", group: "Security", lines: ["Security services"] },
  { kind: "expense", group: "Fee Concessions", lines: ["Exemptions and concessions", "Bad debts"] },
];

// --- Reading a school's own Excel ---------------------------------------------------

export interface ColumnChoice {
  amount: number;
  actual: number;
  lastBudget: number;
}

export type ParsedLine = Pick<BudgetLine, "kind" | "group" | "code" | "name" | "actual" | "lastBudget" | "amount" | "note">;

const cellText = (v: unknown) => String(v ?? "").trim();
const CODED = /^(\d{6})\s+(.+)$/;

/** Reads a number from a cell. A spreadsheet error such as #DIV/0! counts as nothing. */
export function numberIn(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = cellText(v).replace(/[R\s\u00a0]/g, "");
  const negative = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, "");
  const lastComma = s.lastIndexOf(",");
  // South African text uses a decimal comma: 1 200,50. A comma before three digits is a thousands mark: 1,200.
  if (lastComma > s.lastIndexOf(".") && s.length - lastComma - 1 !== 3) s = s.replaceAll(".", "").replace(",", ".");
  else s = s.replaceAll(",", "");
  const n = Number(s);
  if (!s || !Number.isFinite(n)) return 0;
  return negative ? -n : n;
}

/** The row's label: the code and name together, wherever in the first columns they sit. */
function labelOf(row: unknown[], figures: number[] = []): string {
  const cells = row.slice(0, 3).map((c, i) => (figures.includes(i) ? "" : cellText(c)));
  const at = cells.findIndex((c) => c && !(typeof row[cells.indexOf(c)] === "number" && !/^\d{6}$/.test(c)));
  if (at < 0) return "";
  return /^\d{6}$/.test(cells[at]) ? `${cells[at]} ${cells[at + 1] ?? ""}`.trim() : cells[at];
}

/** Finds the budget columns from the headings. -1 means not found, and the person picks. */
export function guessColumns(grid: unknown[][], year: number): ColumnChoice {
  const choice: ColumnChoice = { amount: -1, actual: -1, lastBudget: -1 };
  for (const row of grid.slice(0, 20)) {
    // Headings sit above the first account: a figure further down may just equal the year.
    if (CODED.test(labelOf(row))) break;
    row.forEach((cell, i) => {
      const s = cellText(cell).toLowerCase();
      if (s === String(year) || s === `budget ${year}`) choice.amount = i;
      else if (s.includes("actual") && s.includes(String(year - 1))) choice.actual = i;
      else if (s.includes("budget") && s.includes(String(year - 1))) choice.lastBudget = i;
    });
  }
  return choice;
}

function sectionOf(heading: string, hasFigures: boolean): BudgetKind | null {
  if (/total|surplus|deficit/.test(heading)) return null;
  if (["income", "revenue", "receipts"].includes(heading)) return "income";
  if (["expenses", "expense", "expenditure", "spending", "payments"].includes(heading)) return "expense";
  if (hasFigures) return null;
  if (/expens|expenditure|spending|payments/.test(heading)) return "expense";
  return /income|revenue|receipts/.test(heading) ? "income" : null;
}

/**
 * The lines of a sheet. With six-digit account codes, a group's own figure is ignored
 * because it only adds up the lines beneath it. Codes alone cannot say which rows are
 * groups: 612000 is a line at one school and a group in another part of the same file,
 * and 617500 is a group too. So a code ending 0000 always starts a group; one ending 00
 * does when the last group has reached its total and the rows beneath add up to its
 * figure; one ending 000 or 500 does on that second test alone, so a group whose lines
 * fall short cannot swallow the next group and count it twice.
 * Without codes, any row with a name and a number is a line.
 * Lines with no figures are left out: accounting exports list every dormant account.
 * `skipped` names rows with figures but no code in a coded sheet: never lost in silence.
 */
export function parseGrid(grid: unknown[][], col: ColumnChoice): { lines: ParsedLine[]; dormant: number; skipped: string[] } {
  const figures = [col.amount, col.actual, col.lastBudget].filter((i) => i >= 0);
  const labelled = grid.map((row) => ({ row, label: labelOf(row, figures) }));
  const firstCoded = labelled.findIndex((r) => CODED.test(r.label));
  const coded = firstCoded >= 0;
  const lines: ParsedLine[] = [];
  const skipped: string[] = [];
  let dormant = 0;
  const keep = (l: ParsedLine) => {
    if (l.amount || l.actual || l.lastBudget) lines.push(l);
    else dormant++;
  };
  const figure = (row: unknown[], i: number) => (i >= 0 ? numberIn(row[i]) : 0);

  type Row = Omit<ParsedLine, "group"> & { section: number };
  const rows: Row[] = [];
  let kind: BudgetKind = "income";
  let section = 0;
  labelled.forEach(({ row, label }, at) => {
    if (!label) return;
    const heading = label.toLowerCase();
    const base = { kind, section, actual: figure(row, col.actual), lastBudget: figure(row, col.lastBudget), amount: figure(row, col.amount) };
    const hasFigures = !!(base.amount || base.actual || base.lastBudget);
    const match = label.match(CODED);
    const flips = match ? null : sectionOf(heading, hasFigures);
    if (flips) {
      kind = flips;
      section++;
      return;
    }
    const note = col.amount >= 0 ? row.slice(col.amount + 1).filter((c) => typeof c === "string" && c.trim() && !c.startsWith("#") && !/^[\d.,\s%-]+$/.test(c)).map((c) => cellText(c)).join(" ").slice(0, 500) : "";
    if (match) rows.push({ ...base, note, code: match[1], name: match[2].trim() });
    else if (hasFigures && !/total|surplus|deficit/.test(heading)) {
      if (!coded) rows.push({ ...base, note, code: "", name: label });
      else if (at > firstCoded) skipped.push(label);
    }
  });

  if (!coded) {
    for (const { section: _section, ...r } of rows) keep({ ...r, group: "General" });
    return { lines, dormant, skipped };
  }

  const measureOf = (r: Row) => (r.amount ? "amount" : r.actual ? "actual" : "lastBudget") as "amount" | "actual" | "lastBudget";
  const near = (a: number, b: number) => Math.abs(a - b) < 1;
  // Do the rows beneath this one add up to its figure?
  const addsUp = (i: number) => {
    const measure = measureOf(rows[i]);
    const target = rows[i][measure];
    if (!target) return false;
    let sum = 0;
    for (let j = i + 1; j < rows.length && rows[j].section === rows[i].section && !rows[j].code.endsWith("0000"); j++) {
      sum += rows[j][measure];
      if (near(sum, target)) return true;
    }
    return false;
  };

  let group = "General";
  let pending: ParsedLine | null = null;
  let measure = measureOf(rows[0] ?? ({} as Row));
  let target = 0;
  let running = 0;
  let inSection = 0;
  rows.forEach(({ section: rowSection, ...r }, i) => {
    const reached = rowSection !== inSection || near(running, target);
    const roundest = r.code.endsWith("000") || r.code.endsWith("500");
    if (r.code.endsWith("0000") || ((reached ? r.code.endsWith("00") : roundest) && addsUp(i))) {
      // A group with a figure and no lines beneath it is itself the line.
      if (pending) keep(pending);
      group = r.name;
      pending = { ...r, group };
      measure = measureOf(rows[i]);
      target = r[measure];
      running = 0;
      inSection = rowSection;
      return;
    }
    // A dormant line beneath a group says nothing about the group's own figure.
    if (r.amount || r.actual || r.lastBudget) pending = null;
    running += r[measure];
    keep({ ...r, group });
  });
  if (pending) keep(pending);
  return { lines, dormant, skipped };
}
