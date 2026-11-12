import crypto from "node:crypto";
import { readJson, updateJson, NO_CHANGE } from "./controlData";
import { getUsers } from "./userData";
import { getPeople } from "./peopleData";
import { getTagMembers } from "./tagData";
import { getMeetingTypes } from "./meetingTypesData";
import { meetingTypeLabel } from "./meetingTypes";
import { meetingOrganizer, sendMeetingEmail, type MeetingEmailKind } from "./email";
import { pause } from "./actionItemNotify";
import { longDateLabel, slotLabel, sastToday } from "./roomBookings";
import { MailQueue, notifyWithdrawn } from "./roomBookingNotify";
import { cancelBooking, createBooking, updateBooking, getRoom, type Actor, type BookingInput, type Withdrawal } from "./roomBookingData";
import { alertMinutesOf, daysUntil, meetingIcs, meetingRemindersDue, meetingRemindersSent, meetingStartMs, passedReminders, type Meeting, type MeetingInput, type MeetingRoomLink } from "./meetings";

// Events and meetings. Rules in lib/meetings.ts. One list, every change ONE
// guarded write (updateJson), so two people scheduling at once both keep theirs.
const PATH = "meetings/meetings.json";

// shortcut: invites go out paced (600 ms each) inside the request, so a list is
// capped to fit the route's 300 s. Move the sends to a queue if schools need more.
export const MAX_INVITEES = 300;

export type Outcome<V> = { ok: true; value: V } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });

export async function getMeetings(): Promise<Meeting[]> {
  return readJson<Meeting[]>(PATH, []);
}

export async function getMeeting(id: string): Promise<Meeting | null> {
  return (await getMeetings()).find((m) => m.id === id) ?? null;
}

async function change(id: string, patch: (m: Meeting) => Meeting | null): Promise<Meeting | null> {
  let out: Meeting | null = null;
  await updateJson<Meeting[]>(PATH, [], (list) => {
    out = null;
    const cur = list.find((m) => m.id === id);
    const next = cur ? patch(cur) : null;
    if (!next) return NO_CHANGE;
    out = next;
    return list.map((m) => (m.id === id ? next : m));
  });
  return out;
}

// --- Who is invited -----------------------------------------------------------------

export interface Invitee {
  key: string;
  userId?: string;
  name: string;
  email: string;
}

type Directory = { users: Awaited<ReturnType<typeof getUsers>>; people: Awaited<ReturnType<typeof getPeople>> };
export const loadDirectory = async (): Promise<Directory> => {
  const [users, people] = await Promise.all([getUsers(), getPeople()]);
  return { users, people };
};

/** Everyone invited, resolved NOW (a tag's members on the day the email goes),
 *  one entry per email address. Retired and term-locked logins are left out.
 *  Pass `dir` when resolving many meetings, so each is not another full read. */
export async function meetingInvitees(m: Pick<Meeting, "tagIds" | "personKeys">, dir?: Directory): Promise<Invitee[]> {
  const { users, people } = dir ?? (await loadDirectory());
  const out = new Map<string, Invitee>();
  const usable = new Map(users.filter((u) => !u.retiredAt && !u.termLocked).map((u) => [u.id, u]));
  const add = (i: Invitee) => {
    if (!i.email) return;
    if (i.userId && !usable.has(i.userId)) return;
    const k = i.email.toLowerCase();
    if (!out.has(k)) out.set(k, i);
  };
  for (const tagId of m.tagIds) {
    for (const t of await getTagMembers(tagId, { users, people })) add({ key: t.key, userId: t.userId, name: t.name, email: t.email });
  }
  for (const key of m.personKeys) {
    if (key.startsWith("person:")) {
      const p = people.find((x) => x.id === key.slice(7));
      const u = p?.userId ? usable.get(p.userId) : undefined;
      if (u) add({ key: u.id, userId: u.id, name: `${u.name} ${u.surname}`.trim(), email: u.email });
      else if (p) add({ key, name: p.name || p.position, email: p.email });
    } else {
      const u = usable.get(key);
      if (u) add({ key: u.id, userId: u.id, name: `${u.name} ${u.surname}`.trim(), email: u.email });
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Everyone who has the meeting in their calendar: whoever was emailed it
 *  (kept on the meeting, so someone since taken off a tag still hears of a
 *  change or a cancel) plus whoever is on the list now. */
export function everyoneToTell(m: Meeting, now: Invitee[]): Invitee[] {
  const out = new Map(now.map((i) => [i.email.toLowerCase(), i]));
  for (const i of m.invited ?? []) if (!out.has(i.email.toLowerCase())) out.set(i.email.toLowerCase(), { key: i.email, name: i.name, email: i.email });
  return [...out.values()];
}

/** What a picker offers: every login and every register entry with an email. */
export async function inviteOptions(): Promise<{ key: string; name: string; email: string }[]> {
  const { users, people } = await loadDirectory();
  const live = users.filter((u) => !u.retiredAt && !u.termLocked && u.email);
  const ids = new Set(live.map((u) => u.id));
  return [
    ...live.map((u) => ({ key: u.id, name: `${u.name} ${u.surname}`.trim() || u.email, email: u.email })),
    ...people.filter((p) => p.email && !(p.userId && ids.has(p.userId))).map((p) => ({ key: `person:${p.id}`, name: p.name || p.position, email: p.email })),
  ].sort((a, b) => a.name.localeCompare(b.name));
}

// --- The optional room ----------------------------------------------------------------

// The booking belongs to the MEETING, not to whoever made it: anyone who may
// manage meetings may move or release it, or a second manager's edit would
// leave the old room blocked for good.
const asMeetingOwner = (a: Actor): Actor => ({ ...a, permissions: [...new Set([...a.permissions, "manage_rooms"])] });

async function bookingInput(input: MeetingInput, headcount: number): Promise<BookingInput> {
  // Invitees are not a headcount (not all come): never more than the room seats.
  const room = await getRoom(input.roomId);
  return {
    roomId: input.roomId,
    title: input.title,
    date: input.date,
    startMinute: input.startMinute,
    endMinute: input.endMinute,
    attendeeCount: Math.max(1, Math.min(room?.capacity ?? 500, 500, headcount)),
    bookedForId: "",
    recurrence: { frequency: "none", interval: 1, weekdays: [], endMode: "count", count: 1, until: "" },
  };
}

async function bookRoom(actor: Actor, input: MeetingInput, headcount: number): Promise<Outcome<MeetingRoomLink>> {
  const r = await createBooking(actor, await bookingInput(input, headcount));
  if (!r.ok) return r;
  const b = r.value.bookings[0];
  return { ok: true, value: { roomId: r.value.room.id, roomName: r.value.room.name, date: b.date, bookingId: b.id } };
}

async function tellWithdrawn(withdrawn: Withdrawal[], roomId: string) {
  if (!withdrawn.length) return;
  const mail = new MailQueue();
  await mail.settle(notifyWithdrawn(withdrawn, await getRoom(roomId), mail));
}

/** True once the booking is gone: released now, or already cancelled. */
async function releaseRoom(actor: Actor, link: MeetingRoomLink): Promise<boolean> {
  const r = await cancelBooking(asMeetingOwner(actor), link.roomId, link.date, link.bookingId, "one");
  if (!r.ok) return r.status === 404 || r.error === "That booking is already cancelled";
  // Anyone who had asked the holder for this room is told it is gone.
  await tellWithdrawn(r.value.withdrawn, link.roomId);
  return true;
}

// --- Create, edit, cancel ---------------------------------------------------------------

const PAST = "That time has already passed. Pick a time from now on.";

async function checkList(input: MeetingInput): Promise<Outcome<Invitee[]>> {
  const invitees = await meetingInvitees(input);
  if (!invitees.length) return fail(400, "Nobody with an email address is on that invite list");
  if (invitees.length > MAX_INVITEES) return fail(400, `That list has ${invitees.length} people; the most one meeting can invite is ${MAX_INVITEES}.`);
  return { ok: true, value: invitees };
}

export async function createMeeting(actor: Actor, input: MeetingInput): Promise<Outcome<{ meeting: Meeting; invitees: Invitee[] }>> {
  if (meetingStartMs(input) <= Date.now()) return fail(400, PAST);
  const list = await checkList(input);
  if (!list.ok) return list;
  let room: MeetingRoomLink | null = null;
  if (input.roomId) {
    const r = await bookRoom(actor, input, list.value.length);
    if (!r.ok) return r;
    room = r.value;
  }
  const now = new Date().toISOString();
  const m: Meeting = {
    id: crypto.randomUUID(),
    title: input.title,
    typeId: input.typeId,
    date: input.date,
    startMinute: input.startMinute,
    endMinute: input.endMinute,
    venue: room ? room.roomName : input.venue,
    notes: input.notes,
    tagIds: input.tagIds,
    personKeys: input.personKeys,
    room,
    status: "scheduled",
    sequence: 0,
    reminderSentAt: null,
    reminderDays: input.reminderDays,
    remindersSent: passedReminders(input.reminderDays, input.date, sastToday()),
    alertMinutes: input.alertMinutes,
    invited: list.value.map((i) => ({ name: i.name, email: i.email })),
    createdById: actor.id,
    createdByName: actor.name,
    createdAt: now,
    updatedAt: now,
  };
  await updateJson<Meeting[]>(PATH, [], (all) => [...all, m]);
  return { ok: true, value: { meeting: m, invitees: list.value } };
}

/** The new details, with the room moved, booked or released to match. A
 *  date or time change starts the reminders afresh. `dropped` = had it in
 *  their calendar, no longer invited: they get a cancel. `quiet` = only the
 *  reminder days changed: nothing for invitees to hear about. */
export async function editMeeting(
  actor: Actor,
  id: string,
  input: MeetingInput
): Promise<Outcome<{ before: Meeting; after: Meeting; invitees: Invitee[]; dropped: Invitee[]; roomReleased: boolean; quiet: boolean }>> {
  const before = await getMeeting(id);
  if (!before) return fail(404, "That meeting no longer exists");
  if (before.status !== "scheduled") return fail(400, "That meeting has been cancelled");
  const timeChanged = before.date !== input.date || before.startMinute !== input.startMinute;
  if (timeChanged && meetingStartMs(input) <= Date.now()) return fail(400, PAST);
  const list = await checkList(input);
  if (!list.ok) return list;
  const invitees = list.value;

  let room = before.room;
  let roomReleased = true;
  if (before.room && before.room.roomId === input.roomId) {
    const timeMoved = timeChanged || before.endMinute !== input.endMinute;
    if (timeMoved || before.title !== input.title) {
      const r = await updateBooking(asMeetingOwner(actor), before.room.bookingId, before.room.date, await bookingInput(input, invitees.length));
      if (!r.ok) return r;
      await tellWithdrawn(r.value.withdrawn, before.room.roomId);
      room = { ...before.room, date: input.date };
    }
  } else {
    // A new room is booked BEFORE the old one is let go, so a refused booking
    // leaves the meeting as it was.
    if (input.roomId) {
      const r = await bookRoom(actor, input, invitees.length);
      if (!r.ok) return r;
      room = r.value;
    } else room = null;
    if (before.room) roomReleased = await releaseRoom(actor, before.room);
  }

  const kept = new Set(invitees.map((i) => i.email.toLowerCase()));
  const dropped = everyoneToTell(before, []).filter((i) => !kept.has(i.email.toLowerCase()));
  const venue = room ? room.roomName : input.venue;
  const had = new Set((before.invited ?? []).map((i) => i.email.toLowerCase()));
  const quiet =
    !timeChanged &&
    before.endMinute === input.endMinute &&
    before.title === input.title &&
    before.typeId === input.typeId &&
    before.venue === venue &&
    before.notes === input.notes &&
    before.room?.roomId === room?.roomId &&
    alertMinutesOf(before) === input.alertMinutes &&
    had.size === kept.size &&
    [...kept].every((e) => had.has(e));
  const after = await change(id, (cur) => ({
    ...cur,
    title: input.title,
    typeId: input.typeId,
    date: input.date,
    startMinute: input.startMinute,
    endMinute: input.endMinute,
    venue,
    notes: input.notes,
    tagIds: input.tagIds,
    personKeys: input.personKeys,
    room,
    sequence: quiet ? cur.sequence : cur.sequence + 1,
    reminderDays: input.reminderDays,
    // A new date or time starts the reminders afresh; otherwise ones already sent
    // stay sent, even unticked, so re-ticking one cannot send it twice.
    remindersSent: [
      ...new Set([
        ...(timeChanged ? [] : meetingRemindersSent(cur)),
        ...passedReminders(input.reminderDays, input.date, sastToday()),
      ]),
    ],
    alertMinutes: input.alertMinutes,
    invited: invitees.map((i) => ({ name: i.name, email: i.email })),
    updatedAt: new Date().toISOString(),
  }));
  if (!after) return fail(404, "That meeting no longer exists");
  return { ok: true, value: { before, after, invitees, dropped, roomReleased, quiet } };
}

export async function cancelMeeting(actor: Actor, id: string): Promise<Outcome<{ meeting: Meeting; roomReleased: boolean | null }>> {
  const cur = await getMeeting(id);
  if (!cur) return fail(404, "That meeting no longer exists");
  if (cur.status !== "scheduled") return fail(400, "That meeting is already cancelled");
  const roomReleased = cur.room ? await releaseRoom(actor, cur.room) : null;
  const meeting = await change(id, (m) => (m.status === "scheduled" ? { ...m, status: "cancelled", sequence: m.sequence + 1, updatedAt: new Date().toISOString() } : null));
  if (!meeting) return fail(400, "That meeting is already cancelled");
  return { ok: true, value: { meeting, roomReleased } };
}

// --- Emails ------------------------------------------------------------------------------

/** Emails each person (paced like every portal mailout), the calendar file
 *  attached. Resolves to how many were sent and how many failed. */
export async function emailMeeting(m: Meeting, kind: MeetingEmailKind, people?: Invitee[], today = sastToday()): Promise<{ sent: number; failed: number }> {
  const [invitees, org, types] = await Promise.all([people ?? meetingInvitees(m), meetingOrganizer(), getMeetingTypes()]);
  const facts = {
    title: m.title,
    typeLabel: m.typeId ? meetingTypeLabel(types, m.typeId) : "",
    dateLabel: longDateLabel(m.date),
    timeLabel: slotLabel(m.startMinute, m.endMinute),
    venue: m.venue,
    notes: m.notes,
    organiserName: m.createdByName,
    daysAway: daysUntil(m.date, today),
  };
  let sent = 0;
  let failed = 0;
  for (const [i, p] of invitees.entries()) {
    if (i) await pause();
    const ics = meetingIcs(m, { method: kind === "cancelled" ? "CANCEL" : "REQUEST", organizerEmail: org.email, organizerName: org.name, attendeeEmail: p.email, link: `${org.site}/meetings` });
    if (await sendMeetingEmail(p.email, p.name, kind, facts, ics).catch(() => false)) sent++;
    else failed++;
  }
  return { sent, failed };
}

/** "Send reminder now": stamped so the page can say when it last went. */
export async function remindMeetingNow(id: string): Promise<Outcome<{ sent: number; failed: number }>> {
  const m = await getMeeting(id);
  if (!m) return fail(404, "That meeting no longer exists");
  if (m.status !== "scheduled") return fail(400, "That meeting has been cancelled");
  const r = await emailMeeting(m, "reminder");
  await change(id, (cur) => ({ ...cur, lastReminderAt: new Date().toISOString() }));
  return { ok: true, value: r };
}

/** The 07:00 run: one reminder email per meeting with a reminder day due
 *  (its own choices: a week, 3 days, 2 days, the day before, the morning of).
 *  Claimed before sending so two overlapping runs cannot both send it.
 *  shortcut: a run killed mid-send leaves the rest of that list unreminded
 *  (lists are capped at MAX_INVITEES); keep per-person stamps like room
 *  bookings if schools start inviting hundreds. */
export async function runMeetingReminders(now: Date = new Date()): Promise<{ sent: number; failed: number; detail: string[] }> {
  const today = sastToday(now);
  const due = (await getMeetings()).filter((m) => meetingRemindersDue(m, today, now).length);
  let sent = 0;
  let failed = 0;
  const detail: string[] = [];
  for (const m of due) {
    const claimed = await change(m.id, (cur) => {
      const days = meetingRemindersDue(cur, today, now);
      return days.length ? { ...cur, remindersSent: [...meetingRemindersSent(cur), ...days] } : null;
    });
    if (!claimed) continue;
    const r = await emailMeeting(claimed, "reminder", undefined, today);
    sent += r.sent;
    failed += r.failed;
    detail.push(`Meeting "${m.title}" ${m.date}: reminder sent to ${r.sent}${r.failed ? `, ${r.failed} failed` : ""}`);
  }
  return { sent, failed, detail };
}
