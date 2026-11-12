// Events and meetings: the school's schedule (FINCOM, SGB, AGM, a fun day).
// Pure, no server imports: the page uses the same rules.
//
// Separate from room bookings on purpose (Carl, 12 Nov): an event may have no
// room, and a room can be booked with no event. When one does have a room,
// the booking lives in the room calendar and the event only points at it.

import { startsAtMs } from "./roomBookings";
import { addDays } from "./actionItems";

export interface MeetingRoomLink {
  roomId: string;
  roomName: string;
  /** The booking's date, needed to find it (bookings are filed by month). */
  date: string;
  bookingId: string;
}

export interface Meeting {
  id: string;
  title: string;
  /** A meeting type id (FINCOM, SGB...) or "" for an event with no type. */
  typeId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  /** Where, typed: a place or a Teams link. With a room, the room's name. */
  venue: string;
  notes: string;
  /** Invited by tag: whoever carries the tag on the day an email goes. */
  tagIds: string[];
  /** Invited by name: a user id, or "person:<id>" for someone with no login. */
  personKeys: string[];
  room: MeetingRoomLink | null;
  status: "scheduled" | "cancelled";
  /** Calendar SEQUENCE: each change raises it, so calendars replace the old copy. */
  sequence: number;
  /** When the last automatic reminder was claimed or sent. */
  reminderSentAt: string | null;
  /** Days before the meeting a reminder email goes (0 = the morning of). Missing = [1]. */
  reminderDays?: number[];
  /** The reminder days already sent (or passed before they could go). */
  remindersSent?: number[];
  /** Calendar alert, minutes before the start; 0 = none. Missing = 60. */
  alertMinutes?: number;
  lastReminderAt?: string;
  /** Who was last emailed it (has it in their calendar): told of changes and a cancel. */
  invited?: { name: string; email: string }[];
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingInput {
  title: string;
  typeId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  venue: string;
  notes: string;
  tagIds: string[];
  personKeys: string[];
  /** "" = no room. */
  roomId: string;
  reminderDays: number[];
  alertMinutes: number;
}

/** The reminder choices: days before, all sent on the 07:00 run. */
export const REMINDER_DAYS = [7, 3, 2, 1, 0];
export const ALERT_MINUTES = [0, 15, 30, 60, 120, 1440];
export const reminderDaysOf = (m: Pick<Meeting, "reminderDays">) => m.reminderDays ?? [1];
export const alertMinutesOf = (m: Pick<Meeting, "alertMinutes">) => m.alertMinutes ?? 60;
export const meetingRemindersSent = (m: Meeting) => m.remindersSent ?? (m.reminderSentAt ? reminderDaysOf(m) : []);

const ID = /^[A-Za-z0-9:_-]{1,80}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && ID.test(x)))].slice(0, 200) : null);

export function parseMeetingInput(body: unknown): { ok: true; value: MeetingInput } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const title = str(b.title, 120);
  if (!title) return { ok: false, error: "Give the event a name" };
  const typeId = b.typeId === "" || b.typeId == null ? "" : typeof b.typeId === "string" && ID.test(b.typeId) ? b.typeId : null;
  if (typeId === null) return { ok: false, error: "Invalid meeting type" };
  if (typeof b.date !== "string" || !DATE.test(b.date) || Number.isNaN(Date.parse(`${b.date}T00:00:00Z`))) return { ok: false, error: "Pick a valid date" };
  if (!isInt(b.startMinute, 0, 1439) || !isInt(b.endMinute, 1, 1440) || b.endMinute <= b.startMinute) return { ok: false, error: "The event has to end after it starts" };
  const tagIds = ids(b.tagIds);
  const personKeys = ids(b.personKeys);
  if (!tagIds || !personKeys) return { ok: false, error: "Invalid invite list" };
  if (!tagIds.length && !personKeys.length) return { ok: false, error: "Invite at least one tag or person" };
  const roomId = b.roomId === "" || b.roomId == null ? "" : typeof b.roomId === "string" && ID.test(b.roomId) ? b.roomId : null;
  if (roomId === null) return { ok: false, error: "Invalid room" };
  const reminderDays = b.reminderDays == null ? [1] : Array.isArray(b.reminderDays) && b.reminderDays.every((d) => REMINDER_DAYS.includes(d as number)) ? [...new Set(b.reminderDays as number[])].sort((x, y) => y - x) : null;
  if (!reminderDays) return { ok: false, error: "Invalid reminders" };
  const alertMinutes = b.alertMinutes == null ? 60 : ALERT_MINUTES.includes(b.alertMinutes as number) ? (b.alertMinutes as number) : null;
  if (alertMinutes === null) return { ok: false, error: "Invalid calendar alert" };
  return { ok: true, value: { title, typeId, date: b.date, startMinute: b.startMinute, endMinute: b.endMinute, venue: str(b.venue, 300), notes: str(b.notes, 2000), tagIds, personKeys, roomId, reminderDays, alertMinutes } };
}

export const meetingStartMs = (m: Pick<Meeting, "date" | "startMinute">) => startsAtMs(m.date, m.startMinute);

/** The reminder days whose day has come (on or before `today`) and not yet
 *  sent, for a meeting still ahead. A missed day catches up on the next run;
 *  several due together go as one email. */
export function meetingRemindersDue(m: Meeting, today: string, now: Date): number[] {
  if (m.status !== "scheduled" || meetingStartMs(m) <= now.getTime()) return [];
  const sent = meetingRemindersSent(m);
  return reminderDaysOf(m).filter((d) => !sent.includes(d) && addDays(m.date, -d) <= today);
}

/** Reminder days whose day was already over before the meeting was set up or
 *  moved: never sent (the invite just went), so they count as sent. */
export const passedReminders = (days: number[], date: string, today: string) => days.filter((d) => addDays(date, -d) < today);

/** Whole days from `today` to the meeting, for "today", "tomorrow", "in 3 days". */
export const daysUntil = (date: string, today: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

// --- Calendar file (RFC 5545) ----------------------------------------------------

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
const icsTime = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Lines longer than 75 octets are folded (continuation starts with a space). */
function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > 74) {
      out.push(cur);
      cur = " ";
      bytes = 1;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n");
}

/** One event as a calendar invite. REQUEST adds or updates it in the person's
 *  calendar (same UID, higher SEQUENCE replaces); CANCEL removes it. */
export function meetingIcs(
  m: Meeting,
  opts: { method: "REQUEST" | "CANCEL"; organizerEmail: string; organizerName: string; attendeeEmail?: string; link?: string; now?: Date }
): string {
  const start = meetingStartMs(m);
  const end = start + (m.endMinute - m.startMinute) * 60_000;
  const description = [m.notes, opts.link ? `Details: ${opts.link}` : ""].filter(Boolean).join("\n\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//School Compliance//Meetings//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${opts.method}`,
    "BEGIN:VEVENT",
    `UID:${m.id}@schoolcompliance.co.za`,
    `SEQUENCE:${m.sequence}`,
    `DTSTAMP:${icsTime((opts.now ?? new Date()).getTime())}`,
    `DTSTART:${icsTime(start)}`,
    `DTEND:${icsTime(end)}`,
    `SUMMARY:${icsText(m.title)}`,
    ...(m.venue ? [`LOCATION:${icsText(m.venue)}`] : []),
    ...(description ? [`DESCRIPTION:${icsText(description)}`] : []),
    // A parameter value is quoted, not escaped (RFC 5545 3.2); it may not hold a quote.
    `ORGANIZER;CN="${opts.organizerName.replace(/["\r\n]/g, "")}":mailto:${opts.organizerEmail}`,
    ...(opts.attendeeEmail ? [`ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=FALSE:mailto:${opts.attendeeEmail}`] : []),
    `STATUS:${opts.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    ...(opts.method === "CANCEL" || !alertMinutesOf(m)
      ? []
      : ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(m.title)}`, `TRIGGER:-PT${alertMinutesOf(m)}M`, "END:VALARM"]),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
