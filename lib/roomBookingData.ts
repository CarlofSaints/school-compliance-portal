import { readJson, updateJson, writeJson, listFilesStrict, NO_CHANGE } from "./controlData";
import { getUserById } from "./userData";
import type { SessionPayload } from "./roles";
import {
  MIN_DURATION,
  DAY_START_MINUTE,
  DAY_END_MINUTE,
  MAX_OCCURRENCES,
  expandRecurrence,
  findConflicts,
  longDateLabel,
  minuteLabel,
  monthOf,
  parseDateKey,
  addDays,
  sastToday,
  isPast,
  hasEnded,
  type Recurrence,
} from "./roomBookings";

// ---------------------------------------------------------------------------
// Meeting rooms and their bookings, in the school's Blob store.
//
//   rooms/rooms.json                       Room[]
//   rooms/bookings/<roomId>/<YYYY-MM>.json RoomBooking[]  (one room, one month)
//   rooms/requests/<token>.json            where an "ask for the room" lives
//
// 🔴 One file per room per month, so the clash check and the write happen in
// ONE updateJson: two people clicking the same slot at once cannot both get it.
// A repeat series that spans months is checked across every file first, then
// written file by file; a clash found while writing undoes the files already
// written. A request for the room is kept ON the booking it asks for, so
// approving it (the booking changes hands) is one atomic write too.
//
// Cancelled bookings stay in their file: they are the record of who had what.
// ---------------------------------------------------------------------------

export interface Room {
  id: string;
  name: string;
  capacity: number;
  color: string;
  notes: string;
  /** A room with bookings on record is retired, not deleted. */
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RequestStatus = "pending" | "approved" | "declined" | "withdrawn";

export interface RoomRequest {
  token: string;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  title: string;
  message: string;
  attendeeCount: number;
  status: RequestStatus;
  declineReason?: string;
  createdAt: string;
  respondedAt?: string;
  /** Who held the booking WHEN ASKED. Access to the request link and the
   *  page's wording come from these, not from the booking as it is now: after
   *  an approve the requester holds it and the old holder does not. */
  holderIds?: string[];
  holderName?: string;
}

/** Why a pending request stopped being answerable. The requester is emailed. */
export type WithdrawReason = "cancelled" | "moved" | "given_away" | "lapsed" | "room_retired";

export interface Withdrawal {
  /** The booking as it was before the change. */
  booking: RoomBooking;
  request: RoomRequest;
  reason: WithdrawReason;
}

/** The pending requests on a booking, as withdrawals. */
export function pendingWithdrawals(b: RoomBooking, reason: WithdrawReason, keep?: (r: RoomRequest) => boolean): Withdrawal[] {
  return b.requests.filter((r) => r.status === "pending" && !keep?.(r)).map((request) => ({ booking: b, request, reason }));
}

export interface RoomBooking {
  id: string;
  roomId: string;
  title: string;
  date: string;
  startMinute: number;
  endMinute: number;
  attendeeCount: number;
  bookedById: string;
  bookedByName: string;
  bookedByEmail: string;
  /** Booked on someone else's behalf: they hold it too. */
  bookedForId: string | null;
  bookedForName: string | null;
  bookedForEmail: string | null;
  seriesId: string | null;
  recurrence: Recurrence | null;
  occurrences: number;
  status: "confirmed" | "cancelled";
  reminderSentAt: string | null;
  requests: RoomRequest[];
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  cancelledByName?: string;
}

/** Who is acting. Built from the server session, never from the request body. */
export interface Actor {
  id: string;
  name: string;
  email: string;
  permissions: string[];
}

/** How a person is named on bookings, emails and pickers: "Name Surname", or
 *  their email if both are blank. One rule, used everywhere. */
export function displayName(u: { name?: string; surname?: string; email: string }): string {
  return `${u.name ?? ""} ${u.surname ?? ""}`.trim() || u.email;
}

export function actorOf(s: SessionPayload): Actor {
  return { id: s.id, name: displayName(s), email: s.email, permissions: s.permissions };
}

export type Outcome<V = undefined> =
  | { ok: true; value: V; notice?: string }
  | { ok: false; status: number; error: string; withdrawn?: Withdrawal[] };

const ENDED = "That booking has already ended, so it stays as the record.";
const STARTED = "That meeting has already started, so it can no longer be handed over.";
const PAST = "That time has already passed. Pick a time from now on.";

const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });

const ROOMS_PATH = "rooms/rooms.json";
const fileFor = (roomId: string, month: string) => `rooms/bookings/${roomId}/${month}.json`;
const requestPath = (token: string) => `rooms/requests/${token}.json`;

export const canManageRooms = (a: Actor) => a.permissions.includes("manage_rooms");
export const canBookRooms = (a: Actor) => a.permissions.includes("book_rooms");
export const mayViewBookings = (a: Actor) => canBookRooms(a) || canManageRooms(a);

/** Both people on a booked-for-someone booking hold it. */
export function isHolder(b: RoomBooking, userId: string): boolean {
  return b.bookedById === userId || b.bookedForId === userId;
}

/** Everyone who hears about a booking, de-duplicated by address. */
export function holders(b: RoomBooking): { name: string; email: string }[] {
  const out = [{ name: b.bookedByName, email: b.bookedByEmail }];
  if (b.bookedForEmail && b.bookedForEmail.toLowerCase() !== b.bookedByEmail.toLowerCase()) {
    out.push({ name: b.bookedForName || b.bookedForEmail, email: b.bookedForEmail });
  }
  return out.filter((h) => h.email);
}

/** "Sarah (booked by Jane)" */
export function holderLabel(b: RoomBooking): string {
  return b.bookedForName ? `${b.bookedForName} (booked by ${b.bookedByName})` : b.bookedByName;
}

/** What the calendar may show any booker: no email addresses, and no request
 *  messages (those are between the asker and the holders). */
export function bookingView(b: RoomBooking, actor: Actor) {
  const mine = isHolder(b, actor.id);
  return {
    id: b.id,
    roomId: b.roomId,
    title: b.title,
    date: b.date,
    startMinute: b.startMinute,
    endMinute: b.endMinute,
    attendeeCount: b.attendeeCount,
    bookedById: b.bookedById,
    bookedByName: b.bookedByName,
    bookedForId: b.bookedForId,
    bookedForName: b.bookedForName,
    seriesId: b.seriesId,
    recurrence: b.recurrence,
    occurrences: b.occurrences,
    pendingRequests: b.requests.filter((r) => r.status === "pending").length,
    iAsked: b.requests.some((r) => r.status === "pending" && r.requesterId === actor.id),
    isMine: mine,
    // An ended booking is the record: nobody edits or cancels it.
    canEdit: (mine || canManageRooms(actor)) && !hasEnded(b.date, b.endMinute),
  };
}

export type BookingView = ReturnType<typeof bookingView>;

// --- Request validation --------------------------------------------------------
//
// Strict: every field typed, lengths capped, dates real, minutes whole. Anything
// unexpected is refused rather than coerced.

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[A-Za-z0-9-]{1,64}$/;

export const isId = (v: unknown): v is string => typeof v === "string" && ID.test(v);
export const isDate = (v: unknown): v is string => typeof v === "string" && parseDateKey(v) !== null;
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

function text(v: unknown, max: number, required: boolean, label: string): string | { error: string } {
  if (v === undefined || v === null) v = "";
  if (typeof v !== "string") return { error: `${label} must be text` };
  const s = v.trim();
  if (required && !s) return { error: `${label} is required` };
  if (s.length > max) return { error: `${label} is too long (max ${max} characters)` };
  return s;
}

type Parsed<V> = { ok: true; value: V } | { ok: false; error: string };

export interface RoomInput {
  name: string;
  capacity: number;
  color: string;
  notes: string;
}

export function parseRoomInput(body: unknown): Parsed<RoomInput> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const name = text(b.name, 60, true, "Room name");
  if (typeof name !== "string") return { ok: false, ...name };
  if (!isInt(b.capacity, 1, 500)) return { ok: false, error: "Capacity must be a whole number from 1 to 500" };
  const color = b.color === undefined || b.color === "" ? "#0d9488" : b.color;
  if (typeof color !== "string" || !HEX.test(color)) return { ok: false, error: "Pick a colour" };
  const notes = text(b.notes, 300, false, "Notes");
  if (typeof notes !== "string") return { ok: false, ...notes };
  return { ok: true, value: { name, capacity: b.capacity, color, notes } };
}

export interface BookingInput {
  roomId: string;
  title: string;
  date: string;
  startMinute: number;
  endMinute: number;
  attendeeCount: number;
  /** "" = for the booker. */
  bookedForId: string;
  recurrence: Recurrence;
}

function parseRecurrence(v: unknown): Parsed<Recurrence> {
  if (v === undefined || v === null) return { ok: true, value: { frequency: "none", interval: 1, weekdays: [], endMode: "count", count: 1, until: "" } };
  if (typeof v !== "object") return { ok: false, error: "Invalid repeat" };
  const r = v as Record<string, unknown>;
  if (!["none", "daily", "weekly", "monthly"].includes(r.frequency as string)) return { ok: false, error: "Invalid repeat frequency" };
  if (!isInt(r.interval, 1, 12)) return { ok: false, error: "Repeat every 1 to 12" };
  if (!Array.isArray(r.weekdays) || r.weekdays.length > 7 || !r.weekdays.every((d) => isInt(d, 0, 6)))
    return { ok: false, error: "Invalid repeat weekdays" };
  if (r.endMode !== "count" && r.endMode !== "date") return { ok: false, error: "Invalid repeat end" };
  if (!isInt(r.count, 1, MAX_OCCURRENCES)) return { ok: false, error: `A repeat can run at most ${MAX_OCCURRENCES} times` };
  if (typeof r.until !== "string" || (r.endMode === "date" && !isDate(r.until))) return { ok: false, error: "Pick the date the repeat ends" };
  return {
    ok: true,
    value: {
      frequency: r.frequency as Recurrence["frequency"],
      interval: r.interval,
      weekdays: r.weekdays as number[],
      endMode: r.endMode,
      count: r.count,
      until: r.endMode === "date" ? r.until : "",
    },
  };
}

export function parseBookingInput(body: unknown): Parsed<BookingInput> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (!isId(b.roomId)) return { ok: false, error: "Pick a room" };
  const title = text(b.title, 120, true, "Meeting name");
  if (typeof title !== "string") return { ok: false, ...title };
  if (!isDate(b.date)) return { ok: false, error: "Pick a valid date" };
  if (!isInt(b.startMinute, DAY_START_MINUTE, DAY_END_MINUTE) || !isInt(b.endMinute, DAY_START_MINUTE, DAY_END_MINUTE))
    return { ok: false, error: "Pick valid times" };
  if (b.endMinute - b.startMinute < MIN_DURATION)
    return { ok: false, error: `A meeting has to end after it starts and last at least ${MIN_DURATION} minutes` };
  if (!isInt(b.attendeeCount, 1, 500)) return { ok: false, error: "Number of attendees must be 1 to 500" };
  const bookedForId = b.bookedForId === undefined || b.bookedForId === null || b.bookedForId === "" ? "" : b.bookedForId;
  if (bookedForId !== "" && !isId(bookedForId)) return { ok: false, error: "Invalid person" };
  const rec = parseRecurrence(b.recurrence);
  if (!rec.ok) return rec;
  return {
    ok: true,
    value: {
      roomId: b.roomId,
      title,
      date: b.date,
      startMinute: b.startMinute,
      endMinute: b.endMinute,
      attendeeCount: b.attendeeCount,
      bookedForId: bookedForId as string,
      recurrence: rec.value,
    },
  };
}

// --- Rooms ---------------------------------------------------------------------

export async function getRooms(): Promise<Room[]> {
  const rooms = await readJson<Room[]>(ROOMS_PATH, []);
  return [...rooms].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getRoom(id: string): Promise<Room | null> {
  return (await getRooms()).find((r) => r.id === id) ?? null;
}

/** True once anybody has ever booked the room, cancelled bookings included.
 *  🔴 FAILS CLOSED: if the store cannot be listed, the answer is "yes", so a
 *  storage hiccup can never hard-delete a room that has history. */
export async function roomHasBookings(roomId: string): Promise<boolean> {
  try {
    return (await listFilesStrict(`rooms/bookings/${roomId}`)).length > 0;
  } catch (err) {
    console.error(`[rooms] could not list bookings for ${roomId}, treating as booked:`, err);
    return true;
  }
}

/** Cancels every confirmed booking in a room from today (SAST) on, for a room
 *  being retired: the calendar only shows active rooms, so a booking left
 *  behind would be invisible yet still sent its reminder. Returns what was
 *  cancelled so the holders can be told. */
export async function cancelRoomFutureBookings(roomId: string, byName: string, now: Date = new Date()): Promise<RoomBooking[]> {
  const today = sastToday(now);
  const months = (await listFilesStrict(`rooms/bookings/${roomId}`))
    .map((f) => f.replace(/\.json$/, ""))
    .filter((m) => m >= monthOf(today))
    .sort();
  const out: RoomBooking[] = [];
  for (const m of months) {
    let hit: RoomBooking[] = [];
    await updateJson<RoomBooking[]>(fileFor(roomId, m), [], (list) => {
      hit = [];
      const stamp = new Date().toISOString();
      const next = list.map((b) => {
        if (b.status !== "confirmed" || b.date < today) return b;
        hit.push(b);
        return { ...b, status: "cancelled" as const, requests: withdrawAll(b, stamp), cancelledAt: stamp, cancelledByName: byName, updatedAt: stamp };
      });
      return hit.length ? next : NO_CHANGE;
    });
    out.push(...hit);
  }
  return out;
}

export async function saveRoom(
  actor: Actor,
  id: string | null,
  input: RoomInput & { active?: boolean }
): Promise<Outcome<{ room: Room; cancelled: RoomBooking[] }>> {
  if (!canManageRooms(actor)) return fail(403, "Forbidden");
  let result: Outcome<Room> = fail(404, "That room is no longer in the list");
  let retiredNow = false;
  await updateJson<Room[]>(ROOMS_PATH, [], (rooms) => {
    retiredNow = false;
    const now = new Date().toISOString();
    if (rooms.some((r) => r.id !== id && r.name.toLowerCase() === input.name.toLowerCase())) {
      result = fail(409, "A room with that name already exists");
      return NO_CHANGE;
    }
    if (id === null) {
      const room: Room = { id: crypto.randomUUID(), ...input, active: true, createdAt: now, updatedAt: now };
      result = { ok: true, value: room };
      return [...rooms, room];
    }
    const idx = rooms.findIndex((r) => r.id === id);
    if (idx === -1) {
      result = fail(404, "That room is no longer in the list");
      return NO_CHANGE;
    }
    const room = { ...rooms[idx], ...input, active: input.active ?? rooms[idx].active, updatedAt: now };
    // Any explicit retire, not only the first: cancelling is idempotent, so a
    // retry after a failed cancel finishes the job.
    retiredNow = !room.active && input.active === false;
    result = { ok: true, value: room };
    return rooms.map((r, i) => (i === idx ? room : r));
  });
  const r = result as Outcome<Room>;
  if (!r.ok) return r;
  const cancelled = retiredNow ? await cancelRoomFutureBookings(r.value.id, actor.name) : [];
  return { ok: true, value: { room: r.value, cancelled } };
}

/** Deletes a never-booked room; a room with bookings on record is retired
 *  (and its upcoming bookings cancelled). The room is retired FIRST, so no
 *  booking can be made while it is being checked; if one slipped in anyway
 *  (it read the room just before), the room is put back as retired. */
export async function deleteRoom(
  actor: Actor,
  id: string
): Promise<Outcome<{ room: Room; retired: boolean; cancelled: RoomBooking[] }>> {
  if (!canManageRooms(actor)) return fail(403, "Forbidden");
  let room: Room | null = null;
  await updateJson<Room[]>(ROOMS_PATH, [], (rooms) => {
    room = rooms.find((r) => r.id === id) ?? null;
    if (!room) return NO_CHANGE;
    if (!room.active) return NO_CHANGE;
    return rooms.map((r) => (r.id === id ? { ...r, active: false, updatedAt: new Date().toISOString() } : r));
  });
  const found = room as Room | null;
  if (!found) return fail(404, "That room is no longer in the list");
  const retiredRoom: Room = { ...found, active: false };

  const retire = async () => {
    // Always, not only when it was active: a retry after a failed cancel finishes it.
    const cancelled = await cancelRoomFutureBookings(id, actor.name);
    return {
      ok: true as const,
      value: { room: retiredRoom, retired: true, cancelled },
      notice: `${found.name} has bookings on record, so it has been retired instead of deleted. Its calendar history is kept.`,
    };
  };

  if (await roomHasBookings(id)) return retire();
  await updateJson<Room[]>(ROOMS_PATH, [], (rooms) => (rooms.some((r) => r.id === id) ? rooms.filter((r) => r.id !== id) : NO_CHANGE));
  if (await roomHasBookings(id)) {
    await updateJson<Room[]>(ROOMS_PATH, [], (rooms) => (rooms.some((r) => r.id === id) ? NO_CHANGE : [...rooms, retiredRoom]));
    return retire();
  }
  return { ok: true, value: { room: found, retired: false, cancelled: [] } };
}

// --- Reading bookings ------------------------------------------------------------

async function readMonth(roomId: string, month: string): Promise<RoomBooking[]> {
  return readJson<RoomBooking[]>(fileFor(roomId, month), []);
}

/** Confirmed bookings in one room between two dates, inclusive. */
export async function bookingsBetween(roomId: string, from: string, to: string): Promise<RoomBooking[]> {
  const months = [...new Set([monthOf(from), monthOf(to)])];
  const lists = await Promise.all(months.map((m) => readMonth(roomId, m)));
  return lists
    .flat()
    .filter((b) => b.status === "confirmed" && b.date >= from && b.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute);
}

/** A booking by id, looked up where the caller says it is. The caller's
 *  locator only says WHERE to look; ownership comes from the stored record. */
export async function findBooking(roomId: string, date: string, id: string): Promise<RoomBooking | null> {
  if (!isId(roomId) || !isDate(date) || !isId(id)) return null;
  return (await readMonth(roomId, monthOf(date))).find((b) => b.id === id) ?? null;
}

function clashMessage(roomName: string, slotDate: string, clash: RoomBooking, more: number): string {
  return (
    `${roomName} is already taken on ${longDateLabel(slotDate)} at ${minuteLabel(clash.startMinute)}: ` +
    `"${clash.title}" by ${clash.bookedForName || clash.bookedByName}` +
    (more > 0 ? ` (and ${more} other date${more === 1 ? "" : "s"})` : "")
  );
}

async function resolveBookedFor(bookedForId: string, ownerId: string) {
  if (!bookedForId || bookedForId === ownerId) return { ok: true as const, person: null };
  const u = await getUserById(bookedForId);
  if (!u) return { ok: false as const };
  return { ok: true as const, person: { id: u.id, name: displayName(u), email: u.email } };
}

// --- Create ----------------------------------------------------------------------

export async function createBooking(actor: Actor, input: BookingInput, nowAt: Date = new Date()): Promise<Outcome<{ bookings: RoomBooking[]; room: Room }>> {
  if (!canBookRooms(actor)) return fail(403, "You can't book rooms");
  const room = await getRoom(input.roomId);
  if (!room || !room.active) return fail(400, "That room isn't available");
  if (input.attendeeCount > room.capacity) return fail(400, `${room.name} seats ${room.capacity}. Pick a bigger room or reduce the headcount.`);

  if (isPast(input.date, input.startMinute, nowAt)) return fail(400, PAST);
  const dates = expandRecurrence(input.date, input.recurrence);
  if (dates.length === 0) return fail(400, "That repeat pattern doesn't produce any dates");

  const forWho = await resolveBookedFor(input.bookedForId, actor.id);
  if (!forWho.ok) return fail(400, "That person can't be booked for");

  const now = new Date().toISOString();
  const isSeries = dates.length > 1;
  const seriesId = isSeries ? crypto.randomUUID() : null;
  const bookings: RoomBooking[] = dates.map((date) => ({
    id: crypto.randomUUID(),
    roomId: room.id,
    title: input.title,
    date,
    startMinute: input.startMinute,
    endMinute: input.endMinute,
    attendeeCount: input.attendeeCount,
    bookedById: actor.id,
    bookedByName: actor.name,
    bookedByEmail: actor.email,
    bookedForId: forWho.person?.id ?? null,
    bookedForName: forWho.person?.name ?? null,
    bookedForEmail: forWho.person?.email ?? null,
    seriesId,
    recurrence: isSeries ? input.recurrence : null,
    occurrences: dates.length,
    status: "confirmed",
    reminderSentAt: null,
    requests: [],
    createdAt: now,
    updatedAt: now,
  }));

  const byMonth = new Map<string, RoomBooking[]>();
  for (const b of bookings) byMonth.set(monthOf(b.date), [...(byMonth.get(monthOf(b.date)) ?? []), b]);

  // Check every file first, so a clash in month three is reported before
  // anything is written. A half-booked series is worse than a clear error.
  const existing = (await Promise.all([...byMonth.keys()].map((m) => readMonth(room.id, m)))).flat().filter((b) => b.status === "confirmed");
  const pre = findConflicts(bookings, existing);
  if (pre.length > 0) return fail(409, clashMessage(room.name, pre[0].slot.date, pre[0].clash, pre.length - 1));

  // Then write, re-checking inside each file's own atomic update.
  const written: string[] = [];
  const ids = new Set(bookings.map((b) => b.id));
  const undo = async (months: string[]) => {
    for (const m of months) {
      await updateJson<RoomBooking[]>(fileFor(room.id, m), [], (list) => (list.some((b) => ids.has(b.id)) ? list.filter((b) => !ids.has(b.id)) : NO_CHANGE));
    }
  };
  for (const [month, mine] of byMonth) {
    let clash: { slot: { date: string }; clash: RoomBooking } | null = null;
    try {
      await updateJson<RoomBooking[]>(fileFor(room.id, month), [], (list) => {
        clash = findConflicts(mine, list.filter((b) => b.status === "confirmed"))[0] ?? null;
        return clash ? NO_CHANGE : [...list, ...mine];
      });
    } catch (err) {
      // 🔴 Not a clash but a storage failure: still never leave half a series.
      // This month is undone too, in case the write landed before it failed.
      await undo([...written, month]).catch((e) => console.error("[rooms] could not undo a half-written series:", e));
      throw err;
    }
    if (clash) {
      await undo(written);
      const c = clash as { slot: { date: string }; clash: RoomBooking };
      return fail(409, clashMessage(room.name, c.slot.date, c.clash, 0));
    }
    written.push(month);
  }
  return { ok: true, value: { bookings, room } };
}

// --- Edit ------------------------------------------------------------------------

export interface EditResult {
  before: RoomBooking;
  after: RoomBooking;
  room: Room;
  holderChanged: boolean;
  /** Requests for the old slot, withdrawn because it moved. */
  withdrawn: Withdrawal[];
}

/** Changes ONE occurrence: title, date, times, headcount, who it is for. The
 *  room stays the same (as in COLAB, the form edits within the calendar's room). */
export async function updateBooking(
  actor: Actor,
  id: string,
  locatorDate: string,
  input: BookingInput,
  nowAt: Date = new Date()
): Promise<Outcome<EditResult>> {
  const before = await findBooking(input.roomId, locatorDate, id);
  if (!before) return fail(404, "That booking no longer exists");
  if (before.status !== "confirmed") return fail(400, "That booking has been cancelled");
  if (!isHolder(before, actor.id) && !canManageRooms(actor)) return fail(403, "Only the people holding this room can change it");
  // An ended booking is the record of who had the room; one under way may still change.
  if (hasEnded(before.date, before.endMinute, nowAt)) return fail(400, ENDED);
  const room = await getRoom(before.roomId);
  if (!room || !room.active) return fail(400, "That room isn't available");
  if (input.attendeeCount > room.capacity) return fail(400, `${room.name} seats ${room.capacity}`);

  const forWho = await resolveBookedFor(input.bookedForId, before.bookedById);
  if (!forWho.ok) return fail(400, "That person can't be booked for");

  const moved = before.date !== input.date || before.startMinute !== input.startMinute || before.endMinute !== input.endMinute;
  // Leaving an under-way meeting's times alone is fine; moving one INTO the past is not.
  if ((before.date !== input.date || before.startMinute !== input.startMinute) && isPast(input.date, input.startMinute, nowAt)) return fail(400, PAST);
  const holderChanged = (forWho.person?.id ?? null) !== before.bookedForId;
  const now = new Date().toISOString();
  const after: RoomBooking = {
    ...before,
    title: input.title,
    date: input.date,
    startMinute: input.startMinute,
    endMinute: input.endMinute,
    attendeeCount: input.attendeeCount,
    bookedForId: forWho.person?.id ?? null,
    bookedForName: forWho.person?.name ?? null,
    bookedForEmail: forWho.person?.email ?? null,
    // A moved or re-held booking gets its day-before reminder again.
    reminderSentAt: moved || holderChanged ? null : before.reminderSentAt,
    // Somebody who asked for the OLD slot did not ask for this one.
    requests: moved
      ? withdrawAll(before, now)
      : before.requests,
    updatedAt: now,
  };

  const fromFile = fileFor(room.id, monthOf(before.date));
  const toFile = fileFor(room.id, monthOf(input.date));
  let error: { status: number; error: string } | null = null;

  const clashOf = (list: RoomBooking[]) =>
    findConflicts([after], list.filter((b) => b.status === "confirmed" && b.id !== id))[0] ?? null;

  if (fromFile === toFile) {
    await updateJson<RoomBooking[]>(fromFile, [], (list) => {
      error = null;
      const cur = list.find((b) => b.id === id);
      if (!cur || cur.updatedAt !== before.updatedAt) {
        error = { status: 409, error: "Someone changed this booking a moment ago. Reload and try again." };
        return NO_CHANGE;
      }
      const c = clashOf(list);
      if (c) {
        error = { status: 409, error: clashMessage(room.name, after.date, c.clash, 0) };
        return NO_CHANGE;
      }
      return list.map((b) => (b.id === id ? after : b));
    });
  } else {
    // Different month = different file: add to the new one (with the clash
    // check), then take it out of the old one. If the old one moved meanwhile,
    // the new copy is taken back out.
    await updateJson<RoomBooking[]>(toFile, [], (list) => {
      error = null;
      const c = clashOf(list);
      if (c) {
        error = { status: 409, error: clashMessage(room.name, after.date, c.clash, 0) };
        return NO_CHANGE;
      }
      return [...list.filter((b) => b.id !== id), after];
    });
    if (!error) {
      try {
        await updateJson<RoomBooking[]>(fromFile, [], (list) => {
          error = null;
          const cur = list.find((b) => b.id === id);
          if (!cur || cur.updatedAt !== before.updatedAt) {
            error = { status: 409, error: "Someone changed this booking a moment ago. Reload and try again." };
            return NO_CHANGE;
          }
          return list.filter((b) => b.id !== id);
        });
      } catch (err) {
        // 🔴 The old copy could not be removed: take the new one back out, so
        // the booking is never in two months at once.
        await updateJson<RoomBooking[]>(toFile, [], (list) => list.filter((b) => b.id !== id)).catch((e) =>
          console.error("[rooms] could not undo a half-moved booking:", e)
        );
        throw err;
      }
      if (error) await updateJson<RoomBooking[]>(toFile, [], (list) => list.filter((b) => b.id !== id));
      // The request links point at a month file; follow the booking to its new one.
      if (!error) {
        for (const q of after.requests) {
          await writeJson<RequestPointer>(requestPath(q.token), { roomId: room.id, month: monthOf(after.date), bookingId: id });
        }
      }
    }
  }
  if (error) {
    const e = error as { status: number; error: string };
    return fail(e.status, e.error);
  }
  return { ok: true, value: { before, after, room, holderChanged, withdrawn: moved ? pendingWithdrawals(before, "moved") : [] } };
}

// --- Cancel ----------------------------------------------------------------------

/** Withdraws a booking's pending requests, except any the keep filter says to leave. */
const withdrawAll = (b: RoomBooking, now: string, keep?: (r: RoomRequest) => boolean): RoomRequest[] =>
  b.requests.map((r) => (r.status === "pending" && !keep?.(r) ? { ...r, status: "withdrawn" as const, respondedAt: now } : r));

/** "one" cancels this occurrence. "series" cancels this one and every later
 *  confirmed occurrence still in the series; ended ones are left as the record.
 *
 *  🔴 Who may cancel is decided PER OCCURRENCE, inside the atomic write, from
 *  the record as it is now: an occurrence handed to someone else (edited to be
 *  for them, or given away on request) is theirs, and is skipped and counted
 *  rather than cancelled from under them. A booking that has ended is the
 *  record of who had the room and cannot be cancelled by anyone. */
export async function cancelBooking(
  actor: Actor,
  roomId: string,
  date: string,
  id: string,
  scope: "one" | "series",
  nowAt: Date = new Date()
): Promise<Outcome<{ booking: RoomBooking; count: number; skipped: number; cancelled: RoomBooking[]; withdrawn: Withdrawal[] }>> {
  const booking = await findBooking(roomId, date, id);
  if (!booking) return fail(404, "That booking no longer exists");
  if (!isHolder(booking, actor.id) && !canManageRooms(actor)) return fail(403, "Only the people holding this room can cancel it");
  if (booking.status !== "confirmed") return fail(400, "That booking is already cancelled");
  if (hasEnded(booking.date, booking.endMinute, nowAt)) return fail(400, ENDED);

  const now = new Date().toISOString();
  const mayCancel = (b: RoomBooking) => isHolder(b, actor.id) || canManageRooms(actor);
  const cancel = (b: RoomBooking): RoomBooking => ({
    ...b,
    status: "cancelled",
    requests: withdrawAll(b, now),
    cancelledAt: now,
    cancelledByName: actor.name,
    updatedAt: now,
  });
  let count = 0;
  let skipped = 0;
  /** As they were before cancelling, for the emails. */
  const cancelled: RoomBooking[] = [];

  if (scope === "series" && booking.seriesId) {
    const from = booking.date;
    const months = (await listFilesStrict(`rooms/bookings/${roomId}`))
      .map((f) => f.replace(/\.json$/, ""))
      .filter((m) => m >= monthOf(from))
      .sort();
    for (const m of months) {
      let n = 0;
      let k = 0;
      let hit: RoomBooking[] = [];
      await updateJson<RoomBooking[]>(fileFor(roomId, m), [], (list) => {
        n = 0;
        k = 0;
        hit = [];
        const next = list.map((b) => {
          if (b.seriesId !== booking.seriesId || b.status !== "confirmed" || b.date < from) return b;
          if (hasEnded(b.date, b.endMinute, nowAt)) return b;
          if (!mayCancel(b)) {
            k++;
            return b;
          }
          n++;
          hit.push(b);
          return cancel(b);
        });
        return n === 0 ? NO_CHANGE : next;
      });
      count += n;
      skipped += k;
      cancelled.push(...hit);
    }
    if (count === 0) return fail(403, "Only the people holding this room can cancel it");
  } else {
    let error: { status: number; error: string } | null = null;
    await updateJson<RoomBooking[]>(fileFor(roomId, monthOf(booking.date)), [], (list) => {
      count = 0;
      error = null;
      const cur = list.find((b) => b.id === id);
      if (!cur || cur.status !== "confirmed") {
        error = { status: 409, error: "That booking was cancelled or moved a moment ago. Reload and try again." };
        return NO_CHANGE;
      }
      // Re-checked on the record being written: it may have changed hands since it was read.
      if (!mayCancel(cur)) {
        error = { status: 403, error: "Only the people holding this room can cancel it" };
        return NO_CHANGE;
      }
      count = 1;
      cancelled.length = 0;
      cancelled.push(cur);
      return list.map((b) => (b.id === id ? cancel(b) : b));
    });
    if (error) {
      const e = error as { status: number; error: string };
      return fail(e.status, e.error);
    }
  }
  return { ok: true, value: { booking, count, skipped, cancelled, withdrawn: cancelled.flatMap((b) => pendingWithdrawals(b, "cancelled")) } };
}

// --- Ask the holder for the room --------------------------------------------------

interface RequestPointer {
  roomId: string;
  month: string;
  bookingId: string;
}

export interface RequestInput {
  title: string;
  message: string;
  attendeeCount: number;
}

export function parseRequestInput(body: unknown): Parsed<RequestInput> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const title = text(b.title, 120, true, "What you need the room for");
  if (typeof title !== "string") return { ok: false, ...title };
  const message = text(b.message, 1000, true, "Your reason");
  if (typeof message !== "string") return { ok: false, ...message };
  if (!isInt(b.attendeeCount, 1, 500)) return { ok: false, error: "Number of attendees must be 1 to 500" };
  return { ok: true, value: { title, message, attendeeCount: b.attendeeCount } };
}

export async function requestRoom(
  actor: Actor,
  roomId: string,
  date: string,
  id: string,
  input: RequestInput,
  nowAt: Date = new Date()
): Promise<Outcome<{ booking: RoomBooking; room: Room; request: RoomRequest }>> {
  if (!canBookRooms(actor)) return fail(403, "You can't book rooms");
  const booking = await findBooking(roomId, date, id);
  if (!booking || booking.status !== "confirmed") return fail(404, "That booking is no longer live");
  if (isHolder(booking, actor.id)) return fail(400, "You already have this room");
  // Nobody can hand over a meeting that has already started.
  if (isPast(booking.date, booking.startMinute, nowAt)) return fail(400, STARTED);
  const room = await getRoom(roomId);
  if (!room || !room.active) return fail(404, "That room isn't available");
  if (input.attendeeCount > room.capacity) return fail(400, `${room.name} only seats ${room.capacity}`);

  const request: RoomRequest = {
    token: crypto.randomUUID(),
    requesterId: actor.id,
    requesterName: actor.name,
    requesterEmail: actor.email,
    ...input,
    status: "pending",
    createdAt: new Date().toISOString(),
    holderIds: [booking.bookedById, ...(booking.bookedForId ? [booking.bookedForId] : [])],
    holderName: holderLabel(booking),
  };
  let error: { status: number; error: string } | null = null;
  let live: RoomBooking = booking;
  // The pointer goes first: a request on a booking that nobody can open from
  // its link would be worse than a pointer to nothing.
  await writeJson<RequestPointer>(requestPath(request.token), { roomId, month: monthOf(booking.date), bookingId: id });
  await updateJson<RoomBooking[]>(fileFor(roomId, monthOf(booking.date)), [], (list) => {
    error = null;
    const cur = list.find((b) => b.id === id);
    if (!cur || cur.status !== "confirmed") {
      error = { status: 404, error: "That booking is no longer live" };
      return NO_CHANGE;
    }
    // One live request per person per booking, so nobody can flood an inbox.
    if (cur.requests.some((r) => r.requesterId === actor.id && r.status === "pending")) {
      error = { status: 409, error: "You've already asked for this one. Waiting on their reply." };
      return NO_CHANGE;
    }
    live = { ...cur, requests: [...cur.requests, request] };
    return list.map((b) => (b.id === id ? live : b));
  });
  if (error) {
    const e = error as { status: number; error: string };
    return fail(e.status, e.error);
  }
  return { ok: true, value: { booking: live, room, request } };
}

export interface RequestView {
  booking: RoomBooking;
  request: RoomRequest;
  room: Room | null;
  canAnswer: boolean;
  viewerRole: "holder" | "requester" | "manager";
}

/** Who may answer: whoever holds the booking now, or a room manager who is
 *  not the one asking (nobody approves their own request). */
function mayAnswer(actor: Actor, b: RoomBooking, req: RoomRequest): boolean {
  return isHolder(b, actor.id) || (canManageRooms(actor) && req.requesterId !== actor.id);
}

/** The request behind an emailed link. The token only NAMES it: the reader
 *  must be signed in and be a party to it (holder, requester) or manage rooms. */
export async function getRequestView(actor: Actor, token: string): Promise<Outcome<RequestView>> {
  if (!isId(token)) return fail(404, "That request no longer exists");
  const ptr = await readJson<RequestPointer | null>(requestPath(token), null);
  if (!ptr) return fail(404, "That request no longer exists");
  const booking = (await readMonth(ptr.roomId, ptr.month)).find((b) => b.id === ptr.bookingId);
  const request = booking?.requests.find((r) => r.token === token);
  if (!booking || !request) return fail(404, "That request no longer exists");
  // Access and wording come from who held it WHEN ASKED (recorded on the
  // request), so the old holder can still open their link after an approve,
  // and the requester, who now holds it, still reads as the requester.
  const isRequester = request.requesterId === actor.id;
  const wasHolder = (request.holderIds ?? []).includes(actor.id) || isHolder(booking, actor.id);
  if (!isRequester && !wasHolder && !canManageRooms(actor)) return fail(403, "Only the people holding this room can answer this");
  const canAnswer = request.status === "pending" && mayAnswer(actor, booking, request);
  const viewerRole = isRequester ? "requester" : wasHolder ? "holder" : "manager";
  return { ok: true, value: { booking, request, room: await getRoom(ptr.roomId), canAnswer, viewerRole } };
}

/** The holder's answer. Approving hands the slot over IN PLACE: same room and
 *  time, now the requester's meeting, so nobody else can grab it in between. */
export async function respondToRequest(
  actor: Actor,
  token: string,
  decision: "approve" | "decline",
  reason: string,
  nowAt: Date = new Date()
): Promise<Outcome<{ before: RoomBooking; after: RoomBooking; request: RoomRequest; room: Room | null; onBehalf: boolean; withdrawn: Withdrawal[] }>> {
  if (decision === "decline" && !reason.trim()) return fail(400, "Please say why. They'll only see the reason you give.");
  if (!isId(token)) return fail(404, "That request no longer exists");
  const ptr = await readJson<RequestPointer | null>(requestPath(token), null);
  if (!ptr) return fail(404, "That request no longer exists");

  let error: { status: number; error: string } | null = null;
  let before: RoomBooking | null = null;
  let after: RoomBooking | null = null;
  let answered: RoomRequest | null = null;
  let withdrawn: Withdrawal[] = [];
  let lapsed: Withdrawal[] = [];
  let onBehalf = false;
  await updateJson<RoomBooking[]>(fileFor(ptr.roomId, ptr.month), [], (list) => {
    error = null;
    withdrawn = [];
    lapsed = [];
    const cur = list.find((b) => b.id === ptr.bookingId);
    const req = cur?.requests.find((r) => r.token === token);
    if (!cur || !req) {
      error = { status: 404, error: "That request no longer exists" };
      return NO_CHANGE;
    }
    if (!mayAnswer(actor, cur, req)) {
      error = {
        status: 403,
        error: req.requesterId === actor.id ? "You can't answer your own request" : "Only the people holding this room can answer this",
      };
      return NO_CHANGE;
    }
    if (req.status !== "pending") {
      error = { status: 409, error: "This request has already been answered" };
      return NO_CHANGE;
    }
    if (cur.status !== "confirmed") {
      error = { status: 409, error: "That booking has since been cancelled" };
      return NO_CHANGE;
    }
    const now = new Date().toISOString();
    // Too late to hand over a meeting that has started: the request lapses.
    // Declining is still allowed, it changes nothing.
    if (decision === "approve" && isPast(cur.date, cur.startMinute, nowAt)) {
      error = { status: 409, error: "That meeting time has already passed, so the request has lapsed." };
      lapsed = pendingWithdrawals(cur, "lapsed", (r) => r.token !== token);
      return list.map((b) => (b.id === cur.id ? { ...b, requests: withdrawAll(b, now, (r) => r.token !== token), updatedAt: now } : b));
    }
    answered = decision === "approve"
      ? { ...req, status: "approved", respondedAt: now }
      : { ...req, status: "declined", declineReason: reason.trim().slice(0, 1000), respondedAt: now };
    // Approving gives the slot away, so every other pending ask for it lapses.
    const requests = (decision === "approve" ? withdrawAll(cur, now, (r) => r.token === token) : cur.requests).map((r) =>
      r.token === token ? answered! : r
    );
    withdrawn = decision === "approve" ? pendingWithdrawals(cur, "given_away", (r) => r.token === token) : [];
    onBehalf = !isHolder(cur, actor.id);
    before = cur;
    after =
      decision === "approve"
        ? {
            ...cur,
            title: req.title,
            attendeeCount: req.attendeeCount,
            bookedById: req.requesterId,
            bookedByName: req.requesterName,
            bookedByEmail: req.requesterEmail,
            // The old "booked for" person no longer holds it.
            bookedForId: null,
            bookedForName: null,
            bookedForEmail: null,
            // A handed-over occurrence is its own booking now, out of reach of
            // the old holder's "cancel the series".
            seriesId: null,
            recurrence: null,
            occurrences: 1,
            reminderSentAt: null,
            requests,
            updatedAt: now,
          }
        : { ...cur, requests, updatedAt: now };
    return list.map((b) => (b.id === cur.id ? after! : b));
  });
  if (error) {
    const e = error as { status: number; error: string };
    return { ...fail(e.status, e.error), withdrawn: lapsed };
  }
  return { ok: true, value: { before: before!, after: after!, request: answered!, room: await getRoom(ptr.roomId), onBehalf, withdrawn } };
}

// --- Day-before reminders ----------------------------------------------------------

/** Tomorrow's confirmed, not-yet-reminded bookings across every room. */
export async function bookingsDueForReminder(now: Date = new Date()): Promise<{ booking: RoomBooking; room: Room }[]> {
  const tomorrow = addDays(sastToday(now), 1);
  const out: { booking: RoomBooking; room: Room }[] = [];
  // A retired room has no calendar; its upcoming bookings were cancelled on retiring.
  for (const room of (await getRooms()).filter((r) => r.active)) {
    for (const b of await readMonth(room.id, monthOf(tomorrow))) {
      if (b.date === tomorrow && b.status === "confirmed" && !b.reminderSentAt) out.push({ booking: b, room });
    }
  }
  return out;
}

/** Stamps the reminder BEFORE sending, in one guarded write, so two
 *  overlapping cron runs cannot both send it. Returns false if already taken. */
export async function claimReminder(b: RoomBooking, stamp: string | null, onlyIf: string | null): Promise<boolean> {
  let claimed = false;
  await updateJson<RoomBooking[]>(fileFor(b.roomId, monthOf(b.date)), [], (list) => {
    claimed = false;
    const cur = list.find((x) => x.id === b.id);
    if (!cur || cur.reminderSentAt !== onlyIf) return NO_CHANGE;
    claimed = true;
    return list.map((x) => (x.id === b.id ? { ...x, reminderSentAt: stamp } : x));
  });
  return claimed;
}
