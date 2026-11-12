// Checks the pure meeting rules: input, reminder timing, calendar file.
//   npx tsx scripts/check-meetings.ts
import assert from "node:assert/strict";
import { meetingIcs, meetingRemindersDue, parseMeetingInput, passedReminders, daysUntil, type Meeting } from "../lib/meetings";

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

// 07:00 SAST on the 12th = 05:00 UTC. No reminderDays = the old default (the day before).
const run = new Date("2026-11-12T05:00:00Z");
const due = (x: Meeting, today = "2026-11-12") => meetingRemindersDue(x, today, run);
assert.deepEqual(due(m), [1]);
assert.deepEqual(due({ ...m, date: "2026-11-14" }), []);
assert.deepEqual(due({ ...m, reminderSentAt: "x" }), [], "legacy: already sent");
assert.deepEqual(due({ ...m, status: "cancelled" }), []);
assert.deepEqual(due({ ...m, date: "2026-11-12", startMinute: 6 * 60 }), [], "already started");
// Chosen days: a week, 2 days, the morning of, for a meeting on the 19th.
const w: Meeting = { ...m, date: "2026-11-19", reminderDays: [7, 2, 0], remindersSent: [] };
assert.deepEqual(due(w), [7]);
assert.deepEqual(due({ ...w, remindersSent: [7] }), []);
assert.deepEqual(due({ ...w, remindersSent: [7] }, "2026-11-17"), [2]);
assert.deepEqual(due({ ...w, remindersSent: [7] }, "2026-11-18"), [2], "a missed day catches up");
assert.deepEqual(due({ ...w, remindersSent: [7] }, "2026-11-19"), [2, 0], "two due = one email");
assert.deepEqual(due({ ...w, reminderDays: [] }), [], "no reminders chosen");
// Set up on the 14th: the week-before day (12th) is past, the rest still go.
assert.deepEqual(passedReminders([7, 2, 0], "2026-11-19", "2026-11-14"), [7]);
assert.deepEqual(passedReminders([1], "2026-11-13", "2026-11-12"), [], "tomorrow's FINCOM still reminded");
assert.deepEqual(passedReminders([7], "2026-11-19", "2026-11-12"), [7], "set up on the week-before day: the invite is the reminder");
assert.deepEqual(passedReminders([1, 0], "2026-11-12", "2026-11-12"), [1], "meeting today: the morning-of still goes");
assert.equal(daysUntil("2026-11-19", "2026-11-12"), 7);
const parsed = parseMeetingInput({ title: "x", date: "2026-11-13", startMinute: 600, endMinute: 660, tagIds: ["t"], personKeys: [], reminderDays: [0, 7, 7], alertMinutes: 15 });
assert.ok(parsed.ok && parsed.value.reminderDays.join() === "7,0" && parsed.value.alertMinutes === 15);
assert.equal(parseMeetingInput({ title: "x", date: "2026-11-13", startMinute: 600, endMinute: 660, tagIds: ["t"], personKeys: [], reminderDays: [5] }).ok, false);
assert.equal(parseMeetingInput({ title: "x", date: "2026-11-13", startMinute: 600, endMinute: 660, tagIds: ["t"], personKeys: [], alertMinutes: 45 }).ok, false);

const ics = meetingIcs(m, { method: "REQUEST", organizerEmail: "noreply@x.co.za", organizerName: "HVPS Compliance", attendeeEmail: "a@b.co", now: run });
assert.ok(ics.includes("DTSTART:20261113T150000Z"), "17:00 SAST = 15:00 UTC");
assert.ok(ics.includes("DTEND:20261113T160000Z"));
assert.ok(ics.includes(String.raw`SUMMARY:FINCOM\; budget\, 2027`));
assert.ok(ics.includes("SEQUENCE:2") && ics.includes("METHOD:REQUEST") && ics.includes("BEGIN:VALARM"));
assert.ok(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75), "lines folded");
const cancel = meetingIcs(m, { method: "CANCEL", organizerEmail: "noreply@x.co.za", organizerName: "HVPS" });
assert.ok(cancel.includes("STATUS:CANCELLED") && !cancel.includes("VALARM"));
assert.ok(ics.includes("TRIGGER:-PT60M"), "default alert an hour before");
assert.ok(!meetingIcs({ ...m, alertMinutes: 0 }, { method: "REQUEST", organizerEmail: "a@b.co", organizerName: "x" }).includes("VALARM"), "no alert");
assert.ok(meetingIcs({ ...m, alertMinutes: 1440 }, { method: "REQUEST", organizerEmail: "a@b.co", organizerName: "x" }).includes("TRIGGER:-PT1440M"));
const named = meetingIcs(m, { method: "REQUEST", organizerEmail: "a@b.co", organizerName: 'Hillview Primary, "Compliance"' });
assert.ok(named.includes('ORGANIZER;CN="Hillview Primary, Compliance":mailto:a@b.co'), "CN quoted, quotes dropped");
console.log("check-meetings: all passed");
