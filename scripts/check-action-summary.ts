// Checks the action items summary: when it is due on each frequency, which
// rows go in and in what order, and renders the workbook and the email so they
// can be opened. No server, no blob, no email sent.
//
//   NEXT_PUBLIC_SCHOOL=hvps npx tsx scripts/check-action-summary.ts [outDir]
//
// Writes action-summary.xlsx and action-summary.html to outDir when given.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  actionSummaryDue,
  nextSummaryOn,
  lastScheduledOn,
  parseActionSummary,
  buildSummaryRows,
  countRows,
  byOwner,
  describeSchedule,
  scheduleChanged,
  schoolToday,
  DEFAULT_ACTION_SUMMARY,
  type ActionSummarySettings,
} from "../lib/actionSummary";
import { WEEKDAY_LABELS } from "../lib/weeklyUpdate";
import type { ActionItem } from "../lib/actionItems";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`
  );
}

// 05:00 UTC, when the cron runs. 2026-10-05 is a Monday.
const at = (d: string) => new Date(`${d}T05:00:00Z`);
const on = (over: Partial<ActionSummarySettings> = {}): ActionSummarySettings => ({
  ...DEFAULT_ACTION_SUMMARY,
  enabled: true,
  enabledOn: "2026-10-01", // a Thursday
  ...over,
});

// --- weekly ---
check("off never sends", actionSummaryDue({ ...on(), enabled: false }, at("2026-10-05")), false);
check("weekly: Monday due", actionSummaryDue(on(), at("2026-10-05")), true);
check("weekly: Sunday not due", actionSummaryDue(on(), at("2026-10-04")), false);
check("weekly: sent Monday, Tuesday not due", actionSummaryDue(on({ lastSentOn: "2026-10-05" }), at("2026-10-06")), false);
check("weekly: missed Monday, Wednesday catches up", actionSummaryDue(on(), at("2026-10-07")), true);
check("weekly: missed Monday, Thursday gives up", actionSummaryDue(on(), at("2026-10-08")), false);
check("weekly: switched on ON the Monday, no Tuesday catch-up", actionSummaryDue(on({ enabledOn: "2026-10-05" }), at("2026-10-06")), false);
check("weekly: switched on Monday, next is the Monday after", nextSummaryOn(on({ enabledOn: "2026-10-05" }), at("2026-10-05")), "2026-10-12");
check("weekly: next from Thursday", nextSummaryOn(on(), at("2026-10-01")), "2026-10-05");

// --- weekdays ---
const wd = (over: Partial<ActionSummarySettings> = {}) => on({ frequency: "weekdays", ...over });
check("weekdays: Friday due", actionSummaryDue(wd(), at("2026-10-02")), true);
check("weekdays: Saturday not due", actionSummaryDue(wd(), at("2026-10-03")), false);
check("weekdays: Sunday not due", actionSummaryDue(wd(), at("2026-10-04")), false);
check("weekdays: never catches up a missed day", lastScheduledOn(wd(), "2026-10-03"), null);
check("weekdays: sent today, not again", actionSummaryDue(wd({ lastSentOn: "2026-10-05" }), at("2026-10-05")), false);
check("weekdays: switched on today waits for tomorrow", actionSummaryDue(wd({ enabledOn: "2026-10-05" }), at("2026-10-05")), false);
check("weekdays: next from Friday 2 Oct (sent)", nextSummaryOn(wd({ lastSentOn: "2026-10-02" }), at("2026-10-02")), "2026-10-05");

// --- fortnightly: switched on Thu 1 Oct for Mondays -> 5 Oct, 19 Oct, 2 Nov ---
const fn = (over: Partial<ActionSummarySettings> = {}) => on({ frequency: "fortnightly", ...over });
check("fortnightly: first Monday due", actionSummaryDue(fn(), at("2026-10-05")), true);
check("fortnightly: off-week Monday not due", actionSummaryDue(fn({ lastSentOn: "2026-10-05" }), at("2026-10-12")), false);
check("fortnightly: second Monday due", actionSummaryDue(fn({ lastSentOn: "2026-10-05" }), at("2026-10-19")), true);
check("fortnightly: off-week maps back a week", lastScheduledOn(fn(), "2026-10-14"), "2026-10-05");
check("fortnightly: next after first send", nextSummaryOn(fn({ lastSentOn: "2026-10-05" }), at("2026-10-05")), "2026-10-19");
check("fortnightly: before the anchor there is none", lastScheduledOn(fn({ enabledOn: "2026-10-06" }), "2026-10-06"), null);

// --- monthly ---
const mo = (over: Partial<ActionSummarySettings> = {}) => on({ frequency: "monthly", dayOfMonth: 1, ...over });
check("monthly: 1 Nov due", actionSummaryDue(mo({ lastSentOn: "2026-10-01" }), at("2026-11-01")), true);
check("monthly: 1 Oct is the switch-on day, not due", actionSummaryDue(mo(), at("2026-10-01")), false);
check("monthly: mid-month maps to this month's day", lastScheduledOn(mo({ dayOfMonth: 15 }), "2026-10-20"), "2026-10-15");
check("monthly: before the day maps to last month", lastScheduledOn(mo({ dayOfMonth: 15 }), "2026-10-10"), "2026-09-15");
check("monthly: January maps back to December", lastScheduledOn(mo({ dayOfMonth: 15 }), "2026-01-10"), "2025-12-15");
check("monthly: next from 2 Oct", nextSummaryOn(mo(), at("2026-10-02")), "2026-11-01");
check("monthly: 3 days late gives up", actionSummaryDue(mo({ lastSentOn: "2026-10-01" }), at("2026-11-04")), false);

// --- parsing ---
check("bad frequency falls back to weekly", parseActionSummary({ frequency: "hourly" }).frequency, "weekly");
check("day 31 refused (not every month has it)", parseActionSummary({ dayOfMonth: 31 }).dayOfMonth, 1);
check("enabled must be literally true", parseActionSummary({ enabled: "yes" }).enabled, false);
check("emails lower-cased and de-duplicated", parseActionSummary({ extraEmails: ["A@x.co", "a@x.co", " "] }).extraEmails, ["a@x.co"]);
check("empty recipients stay empty (never 'everyone')", parseActionSummary({}).userIds, []);
check("describe fortnightly", describeSchedule(fn(), WEEKDAY_LABELS), "Every second Monday at 07:00");
check("describe monthly 22nd", describeSchedule(mo({ dayOfMonth: 22 }), WEEKDAY_LABELS), "On the 22nd of every month at 07:00");
check("describe monthly 11th", describeSchedule(mo({ dayOfMonth: 11 }), WEEKDAY_LABELS), "On the 11th of every month at 07:00");

// --- rows ---
const NOW = at("2026-10-08");
const act = (ref: string, over: Partial<ActionItem>): ActionItem =>
  ({
    id: ref,
    ref,
    title: `Action ${ref}`,
    description: "",
    assigneeIds: [],
    assigneeNames: [],
    category: "Governance",
    priority: "medium",
    dueDate: "",
    status: "in_progress",
    progress: 0,
    updates: [],
    reminder: { enabled: true, daysBefore: 3, repeatEveryDays: 7, recipients: ["assignees"] },
    raisedById: "u1",
    raisedByName: "Carl Dos Santos",
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    ...over,
  }) as ActionItem;

const items: ActionItem[] = [
  act("A-001", { title: "Fix the leaking roof over the hall", dueDate: "2026-09-20", assigneeNames: ["Thabo Mokoena"], priority: "high", progress: 40, category: "Maintenance",
    updates: [
      { id: "1", at: "2026-09-25T09:00:00.000Z", byId: "u", byName: "Thabo Mokoena", note: "Two quotes in, waiting on the third.", progress: 40, status: "in_progress" },
      { id: "0", at: "2026-09-10T09:00:00.000Z", byId: "u", byName: "Thabo Mokoena", note: "Contractor called.", progress: 10, status: "in_progress" },
    ] }),
  act("A-002", { title: "Update the admissions policy for BELA", dueDate: "2026-10-12", assigneeNames: ["Priya Naidoo", "Thabo Mokoena"], progress: 70, category: "Policy", description: "Section 5 and the language clause." }),
  act("A-003", { title: "Book the auditors", dueDate: "2026-11-30", assigneeNames: ["Priya Naidoo"], status: "not_started", category: "Finance", priority: "low" }),
  act("A-004", { title: "Name a fundraising lead", assigneeNames: [], status: "blocked", category: "Fundraising" }),
  act("A-005", { title: "Paint the netball poles", dueDate: "2026-10-01", assigneeNames: ["Sipho Dlamini"], status: "blocked", progress: 10, category: "Extra Murals",
    fromMinutes: { minutesId: "m1", minutesTitle: "SGB meeting", minutesPeriod: "September 2026" } }),
  act("A-006", { title: "Done already", status: "done", progress: 100 }),
  act("A-007", { title: "Cancelled one", status: "cancelled" }),
  act("A-008", { title: "Due today", dueDate: "2026-10-08", assigneeNames: ["Sipho Dlamini"], progress: 100 }),
];
const rows = buildSummaryRows(items, 7, NOW);
check("closed items left out", rows.map((r) => r.ref).includes("A-006") || rows.map((r) => r.ref).includes("A-007"), false);
check("order: most late first, then due soon, on track, no date", rows.map((r) => r.ref), ["A-001", "A-005", "A-008", "A-002", "A-003", "A-004"]);
check("health", rows.map((r) => r.health), ["overdue", "overdue", "due_soon", "due_soon", "on_track", "no_date"]);
check("days left", rows.map((r) => r.daysLeft), [-18, -7, 0, 4, 53, null]);
check("latest note is the newest", rows[0].latestNote, "Two quotes in, waiting on the third.");
check("from minutes", rows[1].fromMeeting, "SGB meeting (September 2026)");
const counts = countRows(rows);
check("counts", counts, { open: 6, overdue: 2, dueSoon: 2, onTrack: 1, noDate: 1, blocked: 2, unassigned: 1 });
check("by owner: two-owner action counts for both", byOwner(rows).find((o) => o.owner === "Thabo Mokoena")?.open, 2);
check("by owner: most overdue first", byOwner(rows)[0].owner, "Sipho Dlamini");
check("live register name wins", buildSummaryRows(items, 7, NOW, new Map([["A-003", ["Priya Pillay"]]])).find((r) => r.ref === "A-003")?.owners, "Priya Pillay");

// --- review fixes ---
check("00:30 SAST Monday is Monday, not Sunday", schoolToday(new Date("2026-10-04T22:30:00Z")), "2026-10-05");
check("07:00 cron date unchanged", schoolToday(at("2026-10-05")), "2026-10-05");
check("changing the weekday is a schedule change", scheduleChanged(on(), on({ weekday: 3 })), true);
check("changing recipients is not", scheduleChanged(on(), on({ userIds: ["x"] })), false);
check("moved Wed->Mon on Tue (restamped): no Wednesday catch-up",
  actionSummaryDue(on({ weekday: 1, enabledOn: "2026-10-06", lastSentOn: "2026-09-30" }), at("2026-10-07")), false);
const comma = buildSummaryRows([act("A-009", { assigneeNames: ["Smith, J"], dueDate: "2026-10-01" })], 7, NOW);
check("a comma in a name is still one person", byOwner(comma).map((o) => o.owner), ["Smith, J"]);
const oddStatus = buildSummaryRows([act("A-010", { status: "archived" as ActionItem["status"] })], 7, NOW);

// --- render ---
(async () => {
  const outDir = process.argv[2];
  const { branding } = await import("../lib/branding");
  const { buildSummaryWorkbook, summaryFilename } = await import("../lib/actionSummaryWorkbook");
  const { buildActionSummaryEmail } = await import("../lib/email");
  const xlsx = await buildSummaryWorkbook({ branding, rows, dueSoonDays: 7, asOf: "2026-10-08", scheduleText: describeSchedule(on(), WEEKDAY_LABELS) });
  check("workbook is a zip", xlsx.subarray(0, 2).toString(), "PK");
  check("filename", summaryFilename("HVPS", "2026-10-08"), "HVPS action items 2026-10-08.xlsx");
  const odd = await buildSummaryWorkbook({ branding, rows: oddStatus, dueSoonDays: 7, asOf: "2026-10-08" });
  check("an unknown status still builds", odd.subarray(0, 2).toString(), "PK");
  const empty = await buildSummaryWorkbook({ branding, rows: [], dueSoonDays: 7, asOf: "2026-10-08" });
  check("empty register still builds", empty.subarray(0, 2).toString(), "PK");
  const mail = buildActionSummaryEmail(branding, "Carl", { rows, counts, dueSoonDays: 7, asOf: "2026-10-08", scheduleText: "Every Monday at 07:00", preview: true });
  check("subject", mail.subject, `[Preview] ${branding.shortName} action items: 6 open, 2 overdue, 2 due soon`);
  if (outDir) {
    writeFileSync(join(outDir, "action-summary.xlsx"), xlsx);
    writeFileSync(join(outDir, "action-summary-empty.xlsx"), empty);
    writeFileSync(join(outDir, "action-summary.html"), mail.html);
    console.log(`wrote ${outDir}`);
  }
  console.log(failures ? `\n${failures} FAILED` : "\nall passed");
  process.exit(failures ? 1 : 0);
})();
