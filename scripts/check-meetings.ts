// Checks the pure meeting rules: input, reminder timing, calendar file.
//   npx tsx scripts/check-meetings.ts
import assert from "node:assert/strict";
import { meetingIcs, meetingReminderDue, parseMeetingInput, type Meeting } from "../lib/meetings";

const ok = parseMeetingInput({ title: " FINCOM ", typeId: "fincom", date: "2026-11-13", startMinute: 1020, endMinute: 1080, venue: "Staff room", notes: "", tagIds: ["t1", "t1"], personKeys: ["person:p1"], roomId: "" });
assert.ok(ok.ok);
if (ok.ok) {
  assert.equal(ok.value.title, "FINCOM");
  assert.deepEqual(ok.value.tagIds, ["t1"]);
}
assert.equal(parseMeetingInput({ title: "x", date: "2026-11-13", startMinute: 600, endMinute: 600, tagIds: ["t"], personKeys: [] }).ok, false, "ends after it starts");
assert.equal(parseMeetingInput({ title: "x", date: "2026-11-13", startMinute: 600, endMinute: 660, tagIds: [], personKeys: [] }).ok, false, "nobody invited");
assert.equal(parseMeetingInput({ title: "x", date: "13/11/2026", startMinute: 600, endMinute: 660, tagIds: ["t"], personKeys: [] }).ok, false, "bad date");

const m: Meeting = {
  id: "abc", title: "FINCOM; budget, 2027", typeId: "fincom", date: "2026-11-13", startMinute: 17 * 60, endMinute: 18 * 60,
  venue: "Staff room", notes: "Line one\nLine two", tagIds: ["t1"], personKeys: [], room: null, status: "scheduled",
  sequence: 2, reminderSentAt: null, createdById: "u", createdByName: "Carl", createdAt: "", updatedAt: "",
};

// 07:00 SAST on the 12th = 05:00 UTC: tomorrow's meeting is due, the day after's is not.
const run = new Date("2026-11-12T05:00:00Z");
assert.equal(meetingReminderDue(m, "2026-11-12", run), true);
assert.equal(meetingReminderDue({ ...m, date: "2026-11-14" }, "2026-11-12", run), false);
assert.equal(meetingReminderDue({ ...m, reminderSentAt: "x" }, "2026-11-12", run), false);
assert.equal(meetingReminderDue({ ...m, status: "cancelled" }, "2026-11-12", run), false);
assert.equal(meetingReminderDue({ ...m, date: "2026-11-12", startMinute: 6 * 60 }, "2026-11-12", run), false, "already started");

const ics = meetingIcs(m, { method: "REQUEST", organizerEmail: "noreply@x.co.za", organizerName: "HVPS Compliance", attendeeEmail: "a@b.co", now: run });
assert.ok(ics.includes("DTSTART:20261113T150000Z"), "17:00 SAST = 15:00 UTC");
assert.ok(ics.includes("DTEND:20261113T160000Z"));
assert.ok(ics.includes(String.raw`SUMMARY:FINCOM\; budget\, 2027`));
assert.ok(ics.includes("SEQUENCE:2") && ics.includes("METHOD:REQUEST") && ics.includes("BEGIN:VALARM"));
assert.ok(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75), "lines folded");
const cancel = meetingIcs(m, { method: "CANCEL", organizerEmail: "noreply@x.co.za", organizerName: "HVPS" });
assert.ok(cancel.includes("STATUS:CANCELLED") && !cancel.includes("VALARM"));
const named = meetingIcs(m, { method: "REQUEST", organizerEmail: "a@b.co", organizerName: 'Hillview Primary, "Compliance"' });
assert.ok(named.includes('ORGANIZER;CN="Hillview Primary, Compliance":mailto:a@b.co'), "CN quoted, quotes dropped");
console.log("check-meetings: all passed");
