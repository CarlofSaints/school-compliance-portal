// Actions raised in minutes show those minutes' meeting date: on the register
// (withMeetingDates), in the action summary and in the weekly update.
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-meeting-dates.ts

import { withMeetingDates, type ActionItem } from "../lib/actionItems";
import { buildSummaryRows } from "../lib/actionSummary";
import { buildWeeklyFacts } from "../lib/weeklyUpdate";
import type { MinutesRecord } from "../lib/minutesData";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`);
}

const now = new Date("2026-10-20T08:00:00Z");
const base = {
  description: "", assigneeIds: [], assigneeNames: ["Sam"], category: "", priority: "medium", dueDate: "2026-10-10",
  status: "not_started", progress: 0, updates: [], reminder: {}, raisedById: "u", raisedByName: "U",
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
};
const from = { minutesId: "m1", minutesTitle: "SGB Oct", minutesPeriod: "October 2026" };
const items = [
  { ...base, id: "a1", ref: "A-001", title: "From minutes", fromMinutes: from },
  { ...base, id: "a2", ref: "A-002", title: "Typed date", meetingDate: "2026-09-03" },
  { ...base, id: "a3", ref: "A-003", title: "Minutes without a date", fromMinutes: { ...from, minutesId: "m2" } },
  { ...base, id: "a4", ref: "A-004", title: "Typed date beats minutes", meetingDate: "2026-10-14", fromMinutes: from },
] as unknown as ActionItem[];
const minutes = [
  { id: "m1", meetingDate: "2026-10-15" },
  { id: "m2" },
] as unknown as MinutesRecord[];
const byId = new Map(minutes.map((m) => [m.id, m]));

const dated = withMeetingDates(items, byId);
check("an action from minutes gets the minutes' date", dated[0].fromMinutes?.meetingDate, "2026-10-15");
check("an action not from minutes is unchanged", dated[1], items[1]);
check("minutes with no date leave the action unchanged", dated[2], items[2]);
check("the stored item is not changed", items[0].fromMinutes?.meetingDate, undefined);

const rows = buildSummaryRows(dated, 7, now);
const meeting = (ref: string) => rows.find((r) => r.ref === ref)?.fromMeeting;
check("summary: title, month and the day held", meeting("A-001"), "SGB Oct (October 2026), held 15 October 2026");
check("summary: a typed date alone", meeting("A-002"), "3 September 2026");
check("summary: minutes without a date as before", meeting("A-003"), "SGB Oct (October 2026)");
check("summary: a date typed on the item wins over the minutes'", meeting("A-004"), "SGB Oct (October 2026), held 14 October 2026");

const weekly = buildWeeklyFacts(items, [], minutes, [], now);
const line = (ref: string) => weekly.actions.overdueList.find((l) => l.ref === ref)?.meetingDate;
check("weekly: date from the minutes", line("A-001"), "2026-10-15");
check("weekly: the action's own date", line("A-002"), "2026-09-03");
check("weekly: none when neither has one", line("A-003"), undefined);
check("weekly: a date typed on the item wins over the minutes'", line("A-004"), "2026-10-14");

// An edit hands back the stored record, which never carries the minutes'
// date: running it through withMeetingDates again (what every route does) puts
// it back, so the row the client swaps in still shows it.
const edited = { ...items[0], title: "Edited" } as ActionItem;
check("an edited item re-enriched keeps the minutes' date", withMeetingDates([edited], byId)[0].fromMinutes?.meetingDate, "2026-10-15");

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
