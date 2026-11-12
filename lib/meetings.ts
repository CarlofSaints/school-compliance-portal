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
  /** The automatic reminder (day before) claimed or sent. */
  reminderSentAt: string | null;
  lastReminderAt?: string;
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
}

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
  return { ok: true, value: { title, typeId, date: b.date, startMinute: b.startMinute, endMinute: b.endMinute, venue: str(b.venue, 300), notes: str(b.notes, 2000), tagIds, personKeys, roomId } };
}

export const meetingStartMs = (m: Pick<Meeting, "date" | "startMinute">) => startsAtMs(m.date, m.startMinute);

/** Due for the automatic reminder on the 07:00 run: scheduled, not yet
 *  reminded, starting between now and the end of tomorrow (SAST). */
export function meetingReminderDue(m: Meeting, today: string, now: Date): boolean {
  if (m.status !== "scheduled" || m.reminderSentAt) return false;
  return meetingStartMs(m) > now.getTime() && m.date <= addDays(today, 1);
}

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
    `ORGANIZER;CN=${icsText(opts.organizerName)}:mailto:${opts.organizerEmail}`,
    ...(opts.attendeeEmail ? [`ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=FALSE:mailto:${opts.attendeeEmail}`] : []),
    `STATUS:${opts.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    ...(opts.method === "CANCEL"
      ? []
      : ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(m.title)}`, "TRIGGER:-PT1H", "END:VALARM"]),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
