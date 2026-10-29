import { readJson, updateJson, writeJson, listFilesStrict, NO_CHANGE } from "./controlData";
import { getUserById } from "./userData";
import type { SessionPayload } from "./roles";
import { getRoles, resolveRolePermissions } from "./rolesData";
import {
  MIN_DURATION,
  DAY_START_MINUTE,
  DAY_END_MINUTE,
  MAX_OCCURRENCES,
  expandRecurrence,
  recurrenceSize,
  findConflicts,
  longDateLabel,
  minuteLabel,
  monthOf,
  parseDateKey,
  addDays,
  sastToday,
  isPast,
  startsAtMs,
  remindCutoffMs,
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
  /** Who answered it, so they can still see the outcome after handing over. */
  answeredById?: string;
}

/** Why a pending request stopped being answerable. The requester is emailed. */
export type WithdrawReason = "cancelled" | "moved" | "given_away" | "lapsed" | "room_retired" | "requester_unable" | "holder_unreachable";

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
  /** Random per write (touch): see the updateJson note. */
  rev?: string;
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
  /** Set while a cross-month move is half done: this is the NEW copy, and the
   *  old one may still be in `from`. Readers prefer the old copy until it is
   *  gone; the cron settles a move left like this for MOVE_STALE_MS. */
  moving?: { from: string; at: number; token: string };
  /** Holders' addresses the reminder already reached, so a run that
   *  failed for one person retries only that person. */
  remindedEmails?: string[];
  requests: RoomRequest[];
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  cancelledByName?: string;
  /** Booked from the room's public link by someone with no login. */
  guest?: GuestDetails;
  /** A guest booking blocks the slot at once but waits for a room manager. */
  pendingApproval?: boolean;
}

export interface GuestDetails {
  name: string;
  organisation: string;
  email: string;
  phone: string;
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
const BEING_CHANGED = "This booking is being changed, try again in a moment.";
const PAST = "That time has already passed. Pick a time from now on.";

type Err = { status: number; error: string };

/** The failure an atomic write recorded, as a result; null when there was none.
 *  (The write's closure sets it, which TypeScript cannot follow, hence one helper.) */
function failure(e: Err | null): { ok: false; status: number; error: string } | null {
  return e ? fail(e.status, e.error) : null;
}

/** 🔴 EVERY write to a booking goes through here, so updatedAt always moves
 *  (by at least a millisecond) and a writer comparing it can see the change. */
export function touch(b: RoomBooking, patch: Partial<RoomBooking> = {}): RoomBooking {
  const prev = Date.parse(b.updatedAt);
  let t = Date.now();
  if (Number.isFinite(prev) && t <= prev) t = prev + 1;
  // rev: every booking write is unique, so two racing claims (a reminder, an
  // answer, a withdrawal) cannot both win. See the updateJson note.
  return { ...b, ...patch, updatedAt: new Date(t).toISOString(), rev: crypto.randomUUID() };
}

/** The fields an edit sets. Another write that changes one of these conflicts
 *  with an edit; one that changes anything else (a request, a reminder stamp)
 *  is merged. */
function fingerprint(b: RoomBooking): string {
  return JSON.stringify([b.title, b.date, b.startMinute, b.endMinute, b.attendeeCount, b.bookedById, b.bookedForId, b.status]);
}

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
    // Who it is for is the booker's call (or a room manager's), not the bookee's.
    canChangeHolder: b.bookedById === actor.id || canManageRooms(actor),
    pendingApproval: !!b.pendingApproval,
    // A guest's contact details are for the people who approve, nobody else.
    guest: canManageRooms(actor) ? b.guest ?? null : null,
  };
}

export type BookingView = ReturnType<typeof bookingView>;

/** What the activity log keeps about a booking: who, where, when, and how many
 *  requests. Never request messages, decline reasons or email addresses. */
export function logSafeBooking(b: RoomBooking) {
  return {
    id: b.id,
    roomId: b.roomId,
    title: b.title,
    date: b.date,
    startMinute: b.startMinute,
    endMinute: b.endMinute,
    attendeeCount: b.attendeeCount,
    bookedByName: b.bookedByName,
    bookedForName: b.bookedForName,
    status: b.status,
    seriesId: b.seriesId,
    requestCount: b.requests.length,
    pendingRequests: b.requests.filter((r) => r.status === "pending").length,
  };
}

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

/** A new room: name and capacity required, colour and notes defaulted. */
export function parseRoomInput(body: unknown): Parsed<RoomInput> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const part = parseRoomUpdate({ ...b, color: b.color === undefined || b.color === "" ? "#0d9488" : b.color, notes: b.notes ?? "" });
  if (!part.ok) return part;
  if (part.value.name === undefined) return { ok: false, error: "Room name is required" };
  if (part.value.capacity === undefined) return { ok: false, error: "Capacity must be a whole number from 1 to 500" };
  return { ok: true, value: part.value as RoomInput };
}

/** An edit: only the fields present in the body are checked and written; an
 *  absent colour or notes stays as it is (no defaults on update). */
export function parseRoomUpdate(body: unknown): Parsed<Partial<RoomInput>> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const out: Partial<RoomInput> = {};
  if ("name" in b) {
    const name = text(b.name, 60, true, "Room name");
    if (typeof name !== "string") return { ok: false, ...name };
    out.name = name;
  }
  if ("capacity" in b) {
    if (!isInt(b.capacity, 1, 500)) return { ok: false, error: "Capacity must be a whole number from 1 to 500" };
    out.capacity = b.capacity;
  }
  if ("color" in b) {
    if (typeof b.color !== "string" || !HEX.test(b.color)) return { ok: false, error: "Pick a colour" };
    out.color = b.color;
  }
  if ("notes" in b) {
    const notes = text(b.notes, 300, false, "Notes");
    if (typeof notes !== "string") return { ok: false, ...notes };
    out.notes = notes;
  }
  return { ok: true, value: out };
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
  // "Never" repeats: whatever the hidden end fields still say is irrelevant.
  if (r.frequency === "none") return parseRecurrence(null);
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
    // A month file emptied by an undone write is no history; stop at the first
    // that holds anything (usually the first file read).
    for (const m of await listFilesStrict(`rooms/bookings/${roomId}`)) {
      if ((await readJson<RoomBooking[]>(`rooms/bookings/${roomId}/${m}`, [])).length > 0) return true;
    }
    return false;
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
  const months = await monthsFrom(roomId, monthOf(today));
  const out: RoomBooking[] = [];
  for (const m of months) {
    let hit: RoomBooking[] = [];
    await updateJson<RoomBooking[]>(fileFor(roomId, m), [], (list) => {
      hit = [];
      const stamp = new Date().toISOString();
      const next = list.map((b) => {
        // Only meetings that have not started: one under way carries on, an ended one is the record.
        if (b.status !== "confirmed" || isPast(b.date, b.startMinute, now)) return b;
        hit.push(b);
        return touch(b, { status: "cancelled", requests: withdrawAll(b, stamp), cancelledAt: stamp, cancelledByName: byName });
      });
      return hit.length ? next : NO_CHANGE;
    });
    out.push(...hit);
  }
  // A half-moved booking has a copy in two months: both are marked cancelled,
  // but it is ONE booking (one email, one count).
  return dedupeById(out);
}

function dedupeById(list: RoomBooking[]): RoomBooking[] {
  return [...new Map(list.map((b) => [b.id, b])).values()];
}

export async function saveRoom(
  actor: Actor,
  id: string | null,
  input: (RoomInput | Partial<RoomInput>) & { active?: boolean }
): Promise<Outcome<{ room: Room; cancelled: RoomBooking[] }>> {
  if (!canManageRooms(actor)) return fail(403, "Forbidden");
  let result: Outcome<Room> = fail(404, "That room is no longer in the list");
  let retiredNow = false;
  await updateJson<Room[]>(ROOMS_PATH, [], (rooms) => {
    retiredNow = false;
    const now = new Date().toISOString();
    if (input.name !== undefined && rooms.some((r) => r.id !== id && r.name.toLowerCase() === input.name!.toLowerCase())) {
      result = fail(409, "A room with that name already exists");
      return NO_CHANGE;
    }
    if (id === null) {
      const full = input as RoomInput;
      if (full.name === undefined || full.capacity === undefined) {
        result = fail(400, "A new room needs a name and a capacity");
        return NO_CHANGE;
      }
      const room: Room = { id: crypto.randomUUID(), name: full.name, capacity: full.capacity, color: full.color, notes: full.notes, active: true, createdAt: now, updatedAt: now };
      result = { ok: true, value: room };
      return [...rooms, room];
    }
    const idx = rooms.findIndex((r) => r.id === id);
    if (idx === -1) {
      result = fail(404, "That room is no longer in the list");
      return NO_CHANGE;
    }
    // Only the fields sent: a retire sends just `active`, so it cannot undo
    // another manager's edit of the name or capacity made a moment before.
    const sent = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as Partial<Room>;
    const room = { ...rooms[idx], ...sent, active: input.active ?? rooms[idx].active, updatedAt: now };
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

/** The room's month files from `fromMonth` on, oldest first. Throws if the
 *  store cannot be listed (never reads a failure as "no bookings"). */
async function monthsFrom(roomId: string, fromMonth: string): Promise<string[]> {
  return (await listFilesStrict(`rooms/bookings/${roomId}`))
    .map((f) => f.replace(/\.json$/, ""))
    .filter((m) => m >= fromMonth)
    .sort();
}

async function readMonthRaw(roomId: string, month: string): Promise<RoomBooking[]> {
  return readJson<RoomBooking[]>(fileFor(roomId, month), []);
}

/** A month's bookings as readers should see them: a half-moved row whose old
 *  copy is still in its source month is left out (the old copy is the live one
 *  until it is removed), so a move never shows or reminds twice. */
async function readMonth(roomId: string, month: string): Promise<RoomBooking[]> {
  const list = await readMonthRaw(roomId, month);
  const moving = list.filter((b) => b.moving && b.moving.from !== month);
  if (moving.length === 0) return list;
  const sources = new Map<string, Set<string>>();
  for (const m of new Set(moving.map((b) => b.moving!.from))) {
    sources.set(m, new Set((await readMonthRaw(roomId, m)).map((b) => b.id)));
  }
  return list.filter((b) => !(b.moving && sources.get(b.moving.from)?.has(b.id)));
}

/** A move left half done this long (the request that made it died) is settled
 *  by the cron: rolled back if the old copy is still there, finished if not. */
export const MOVE_STALE_MS = 15 * 60_000;

// Every move in flight is listed here from step 1 until it settles, so the
// cron reads one small file instead of every booking file.
interface PendingMove {
  roomId: string;
  bookingId: string;
  /** The month the new copy is in. */
  month: string;
  token: string;
  at: number;
}
const MOVES_PENDING_PATH = "rooms/moves-pending.json";

async function addPendingMove(m: PendingMove): Promise<void> {
  await updateJson<PendingMove[]>(MOVES_PENDING_PATH, [], (list) => [...list.filter((x) => x.token !== m.token), m]);
}

async function clearPendingMove(token: string): Promise<void> {
  await updateJson<PendingMove[]>(MOVES_PENDING_PATH, [], (list) => (list.some((x) => x.token === token) ? list.filter((x) => x.token !== token) : NO_CHANGE));
}

/** The move in flight for a booking, if any (its target month). */
async function pendingMoveFor(roomId: string, bookingId: string): Promise<PendingMove | null> {
  return (await readJson<PendingMove[]>(MOVES_PENDING_PATH, [])).find((x) => x.roomId === roomId && x.bookingId === bookingId) ?? null;
}

export async function settleStaleMoves(now: Date = new Date()): Promise<{ rolledBack: number; finished: number }> {
  let rolledBack = 0;
  let finished = 0;
  const pending = await readJson<PendingMove[]>(MOVES_PENDING_PATH, []);
  for (const mv of pending.filter((x) => now.getTime() - x.at >= MOVE_STALE_MS)) {
    const target = (await readMonthRaw(mv.roomId, mv.month)).find((x) => x.id === mv.bookingId && x.moving?.token === mv.token);
    if (target) {
      const oldThere = (await readMonthRaw(mv.roomId, target.moving!.from)).some((x) => x.id === mv.bookingId);
      await updateJson<RoomBooking[]>(fileFor(mv.roomId, mv.month), [], (rows) => {
        const cur = rows.find((x) => x.id === mv.bookingId && x.moving?.token === mv.token);
        if (!cur) return NO_CHANGE;
        return oldThere ? rows.filter((x) => x !== cur) : rows.map((x) => (x === cur ? touch(x, { moving: undefined }) : x));
      });
      if (oldThere) rolledBack++;
      else {
        finished++;
        for (const q of target.requests) await writeJson<RequestPointer>(requestPath(q.token), { roomId: mv.roomId, month: mv.month, bookingId: mv.bookingId });
      }
    }
    await clearPendingMove(mv.token);
  }
  return { rolledBack, finished };
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

/** A user's permissions from their role, or null if the user no longer exists. */
async function userPermissions(userId: string): Promise<string[] | null> {
  const u = await getUserById(userId);
  if (!u) return null;
  const role = (await getRoles()).find((r) => r.id === u.role);
  return resolveRolePermissions(u.role, role);
}

/** Whether a user still exists and still holds book_rooms. */
async function userCanBook(userId: string): Promise<boolean> {
  return (await userPermissions(userId))?.includes("book_rooms") ?? false;
}

async function resolveBookedFor(bookedForId: string, ownerId: string, stored?: RoomBooking) {
  if (!bookedForId || bookedForId === ownerId) return { ok: true as const, person: null };
  // Unchanged: keep who it is for even if that login has since been removed,
  // or the booking could never be edited again.
  if (stored && stored.bookedForId === bookedForId && stored.bookedForEmail) {
    return { ok: true as const, person: { id: bookedForId, name: stored.bookedForName || stored.bookedForEmail, email: stored.bookedForEmail } };
  }
  const u = await getUserById(bookedForId);
  if (!u) return { ok: false as const };
  // They become a holder (reminders, answering requests), so they must be
  // able to book, or manage rooms. Same rule as handing a room over on approve.
  const perms = (await userPermissions(u.id)) ?? [];
  if (!perms.includes("book_rooms") && !perms.includes("manage_rooms")) return { ok: false as const };
  return { ok: true as const, person: { id: u.id, name: displayName(u), email: u.email } };
}

// --- Create ----------------------------------------------------------------------

export async function createBooking(actor: Actor, input: BookingInput, nowAt: Date = new Date(), extra: Partial<RoomBooking> = {}): Promise<Outcome<{ bookings: RoomBooking[]; room: Room }>> {
  if (!canBookRooms(actor)) return fail(403, "You can't book rooms");
  const room = await getRoom(input.roomId);
  if (!room || !room.active) return fail(400, "That room isn't available");
  if (input.attendeeCount > room.capacity) return fail(400, `${room.name} seats ${room.capacity}. Pick a bigger room or reduce the headcount.`);

  if (isPast(input.date, input.startMinute, nowAt)) return fail(400, PAST);
  if (input.recurrence.endMode === "date" && input.recurrence.frequency !== "none") {
    const n = recurrenceSize(input.date, input.recurrence);
    if (n > MAX_OCCURRENCES) return fail(400, `That repeat makes ${n} bookings; the most is ${MAX_OCCURRENCES}. Pick an earlier end date.`);
  }
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
    ...extra,
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
  // 🔴 The room may have been retired or deleted while this was being written
  // (deleteRoom retires first, then deletes). If so, take OUR still-confirmed
  // rows back out; rows the retire already cancelled stay as the record.
  const now2 = await getRoom(room.id);
  if (!now2?.active) {
    for (const m of written) {
      await updateJson<RoomBooking[]>(fileFor(room.id, m), [], (list) =>
        list.some((b) => ids.has(b.id) && b.status === "confirmed") ? list.filter((b) => !(ids.has(b.id) && b.status === "confirmed")) : NO_CHANGE
      );
    }
    return fail(409, now2 ? `${room.name} was retired while you were booking it, so nothing was booked.` : "That room was removed while you were booking it, so nothing was booked.");
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
 *  room stays the same (as in COLAB, the form edits within the calendar's room).
 *
 *  🔴 The edit is applied to the record AS IT IS INSIDE THE WRITE, not to the
 *  copy read first: a request or a reminder stamp that landed in between is
 *  kept (only the edited fields come from the form). A conflicting change to
 *  those edited fields (someone else's edit, an approve, a cancel) refuses.
 *
 *  `beforeWrite` is told whether this edit will send email, before anything
 *  is written, so the route can apply the email limit; returning false stops it. */
export async function updateBooking(
  actor: Actor,
  id: string,
  locatorDate: string,
  input: BookingInput,
  nowAt: Date = new Date(),
  beforeWrite?: (willEmail: boolean) => Promise<boolean>
): Promise<Outcome<EditResult>> {
  const before = await findBooking(input.roomId, locatorDate, id);
  if (!before) return fail(404, "That booking no longer exists");
  if (before.status !== "confirmed") return fail(400, "That booking has been cancelled");
  if (!isHolder(before, actor.id) && !canManageRooms(actor)) return fail(403, "Only the people holding this room can change it");
  // An ended booking is the record of who had the room; one under way may still change.
  if (hasEnded(before.date, before.endMinute, nowAt)) return fail(400, ENDED);
  const room = await getRoom(before.roomId);
  if (!room || !room.active) return fail(400, "That room isn't available");
  // Only when the headcount changes: a room lowered below an existing booking's
  // headcount must not stop its holder renaming or moving it.
  if (input.attendeeCount !== before.attendeeCount && input.attendeeCount > room.capacity) return fail(400, `${room.name} seats ${room.capacity}`);

  const forWho = await resolveBookedFor(input.bookedForId, before.bookedById, before);
  if (!forWho.ok) return fail(400, "That person can't be booked for");

  // A different day or start is a move (requests for the old slot lapse, the
  // reminder is due again). Only extending or shortening the end is not.
  const moved = before.date !== input.date || before.startMinute !== input.startMinute;
  if (moved && isPast(input.date, input.startMinute, nowAt)) return fail(400, PAST);
  // A meeting under way can be extended, not ended in the past.
  if (hasEnded(input.date, input.endMinute, nowAt)) return fail(400, "The end time has already passed.");
  const holderChanged = (forWho.person?.id ?? null) !== before.bookedForId;
  if (holderChanged && before.bookedById !== actor.id && !canManageRooms(actor))
    return fail(403, "Only the person who made the booking can change who it is for");

  if (beforeWrite) {
    const changed =
      before.title !== input.title || before.date !== input.date || before.startMinute !== input.startMinute ||
      before.endMinute !== input.endMinute || before.attendeeCount !== input.attendeeCount;
    const otherHolder = holders(before).some((h) => h.email.toLowerCase() !== actor.email.toLowerCase());
    // A move or re-hold also sends the reminder at once if it now starts before
    // the next run's cutoff (remindNowIfBeforeNextRun).
    const remindsNow = (moved || holderChanged) && startsAtMs(input.date, input.startMinute) < remindCutoffMs(nowAt);
    const willEmail = holderChanged || (moved && before.requests.some((r) => r.status === "pending")) || (changed && otherHolder) || remindsNow;
    if (!(await beforeWrite(willEmail))) return fail(429, "Too many emails");
  }

  /** The edit, applied to whatever the record holds right now. */
  const apply = (cur: RoomBooking): RoomBooking => {
    const stamp = new Date().toISOString();
    return touch(cur, {
      title: input.title,
      date: input.date,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      attendeeCount: input.attendeeCount,
      bookedForId: forWho.person?.id ?? null,
      bookedForName: forWho.person?.name ?? null,
      bookedForEmail: forWho.person?.email ?? null,
      // A moved or re-held booking gets its reminder again.
      reminderSentAt: moved || holderChanged ? null : cur.reminderSentAt,
      remindedEmails: moved || holderChanged ? [] : cur.remindedEmails,
      // Somebody who asked for the OLD slot did not ask for this one.
      requests: moved ? withdrawAll(cur, stamp) : cur.requests,
    });
  };
  const CHANGED = { status: 409, error: "Someone changed this booking a moment ago. Reload and try again." };
  const sameEdit = (cur: RoomBooking | undefined): cur is RoomBooking => !!cur && fingerprint(cur) === fingerprint(before);

  const fromFile = fileFor(room.id, monthOf(before.date));
  const toFile = fileFor(room.id, monthOf(input.date));
  let error: Err | null = null;
  let after: RoomBooking = apply(before);
  let current: RoomBooking = before;

  const clashOf = (list: RoomBooking[]) =>
    findConflicts([after], list.filter((b) => b.status === "confirmed" && b.id !== id))[0] ?? null;

  if (fromFile === toFile) {
    await updateJson<RoomBooking[]>(fromFile, [], (list) => {
      error = null;
      const cur = list.find((b) => b.id === id);
      if (!sameEdit(cur)) {
        error = CHANGED;
        return NO_CHANGE;
      }
      current = cur;
      after = apply(cur);
      const c = clashOf(list);
      if (c) {
        error = { status: 409, error: clashMessage(room.name, after.date, c.clash, 0) };
        return NO_CHANGE;
      }
      return list.map((b) => (b.id === id ? after : b));
    });
  } else {
    // Different month = different file: add to the new one (with the clash
    // check), then take it out of the old one. If the old one changed
    // meanwhile, the new copy is taken back out.
    // Step 1: the new copy, marked as moving from the old month with THIS
    // edit's own token, listed in the pending-moves index first.
    const moveToken = crypto.randomUUID();
    const isMine = (b: RoomBooking) => b.id === id && b.moving?.token === moveToken;
    after = { ...after, moving: { from: monthOf(before.date), at: Date.now(), token: moveToken } };
    await addPendingMove({ roomId: room.id, bookingId: id, month: monthOf(input.date), token: moveToken, at: after.moving!.at });
    await updateJson<RoomBooking[]>(toFile, [], (list) => {
      error = null;
      // 🔴 Another copy of this booking already here (a second edit moving it
      // at the same time): refuse, never overwrite or later delete it.
      if (list.some((b) => b.id === id && !isMine(b))) {
        error = CHANGED;
        return NO_CHANGE;
      }
      const c = clashOf(list);
      if (c) {
        error = { status: 409, error: clashMessage(room.name, after.date, c.clash, 0) };
        return NO_CHANGE;
      }
      return [...list.filter((b) => !isMine(b)), after];
    });
    if (error) await clearPendingMove(moveToken);
    if (!error) {
      try {
        await updateJson<RoomBooking[]>(fromFile, [], (list) => {
          error = null;
          const cur = list.find((b) => b.id === id);
          if (!sameEdit(cur)) {
            error = CHANGED;
            return NO_CHANGE;
          }
          current = cur;
          return list.filter((b) => b.id !== id);
        });
      } catch (err) {
        // 🔴 The old copy could not be removed: take the new one back out, so
        // the booking is never in two months at once.
        // Only this edit's own copy, never another edit's.
        await updateJson<RoomBooking[]>(toFile, [], (list) => (list.some(isMine) ? list.filter((b) => !isMine(b)) : NO_CHANGE))
          .then(() => clearPendingMove(moveToken))
          .catch((e) => console.error("[rooms] could not undo a half-moved booking:", e));
        throw err;
      }
      if (error) {
        await updateJson<RoomBooking[]>(toFile, [], (list) => (list.some(isMine) ? list.filter((b) => !isMine(b)) : NO_CHANGE));
        await clearPendingMove(moveToken);
      } else {
        // Step 3: settle the new copy. It is merged with whatever it holds NOW
        // (a request may have landed on it) and with anything that landed on
        // the old copy before it went (carried over, withdrawn: the slot
        // moved), and the moving mark is cleared. Done on the current row
        // inside the write, so nothing is dropped.
        const fromOld = apply(current);
        await updateJson<RoomBooking[]>(toFile, [], (list) => {
          const mine = list.find(isMine);
          if (!mine) return NO_CHANGE;
          const settled = touch(mine, { requests: mergeRequests(mine.requests, fromOld.requests), moving: undefined });
          after = settled;
          return list.map((b) => (b === mine ? settled : b));
        });
        await clearPendingMove(moveToken);
        // The request links point at a month file; follow the booking to its new one.
        for (const q of after.requests) {
          await writeJson<RequestPointer>(requestPath(q.token), { roomId: room.id, month: monthOf(after.date), bookingId: id });
        }
      }
    }
  }
  const bad = failure(error);
  if (bad) return bad;
  // 🔴 The room may have been retired or deleted while this was being written
  // (it was read as active before). Put the edited fields back as they were.
  if (!(await getRoom(room.id))?.active) {
    // Ours = exactly what this edit wrote, still confirmed. A copy the retire
    // cancelled is the record now and is left alone (never resurrected).
    const ours = (b: RoomBooking) => b.id === id && b.updatedAt === after.updatedAt && b.status === "confirmed";
    const undoEdit = (b: RoomBooking) =>
      touch(b, {
        title: current.title,
        date: current.date,
        startMinute: current.startMinute,
        endMinute: current.endMinute,
        attendeeCount: current.attendeeCount,
        bookedForId: current.bookedForId,
        bookedForName: current.bookedForName,
        bookedForEmail: current.bookedForEmail,
        reminderSentAt: current.reminderSentAt,
        remindedEmails: current.remindedEmails,
        requests: current.requests,
      });
    if (fromFile === toFile) {
      await updateJson<RoomBooking[]>(fromFile, [], (list) => (list.some(ours) ? list.map((b) => (ours(b) ? undoEdit(b) : b)) : NO_CHANGE));
    } else {
      // Only if our new copy is still exactly ours: if retiring the room
      // cancelled it meanwhile, bringing the old one back would resurrect a
      // booking in a retired room. Then the old row stays removed.
      let removedOurs = false;
      await updateJson<RoomBooking[]>(toFile, [], (list) => {
        removedOurs = list.some(ours);
        return removedOurs ? list.filter((b) => !ours(b)) : NO_CHANGE;
      });
      if (removedOurs) {
        await updateJson<RoomBooking[]>(fromFile, [], (list) => (list.some((b) => b.id === id) ? NO_CHANGE : [...list, touch(current)]));
        for (const q of current.requests) {
          await writeJson<RequestPointer>(requestPath(q.token), { roomId: room.id, month: monthOf(current.date), bookingId: id });
        }
      }
    }
    return fail(400, "That room isn't available");
  }
  return { ok: true, value: { before: current, after, room, holderChanged, withdrawn: moved ? pendingWithdrawals(current, "moved") : [] } };
}

// --- Cancel ----------------------------------------------------------------------

/** One list of requests from two copies of a booking. A token on both keeps
 *  whichever copy answered it most recently (a decline recorded on the old
 *  copy during a move survives); one still pending on both keeps the first. */
function mergeRequests(a: RoomRequest[], b: RoomRequest[]): RoomRequest[] {
  const out = new Map<string, RoomRequest>();
  for (const q of [...a, ...b]) {
    const have = out.get(q.token);
    if (!have || (q.respondedAt ?? "") > (have.respondedAt ?? "")) out.set(q.token, q);
  }
  return [...out.values()];
}

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
  nowAt: Date = new Date(),
  beforeWrite?: (willEmail: boolean) => Promise<boolean>
): Promise<Outcome<{ booking: RoomBooking; count: number; skipped: number; cancelled: RoomBooking[]; withdrawn: Withdrawal[] }>> {
  const booking = await findBooking(roomId, date, id);
  if (!booking) return fail(404, "That booking no longer exists");
  if (!isHolder(booking, actor.id) && !canManageRooms(actor)) return fail(403, "Only the people holding this room can cancel it");
  if (booking.status !== "confirmed") return fail(400, "That booking is already cancelled");
  if (hasEnded(booking.date, booking.endMinute, nowAt)) return fail(400, ENDED);
  if (beforeWrite) {
    // A series may touch other people's occurrences and their requesters; a
    // single one emails if someone else holds it or someone is waiting on it.
    const willEmail =
      (scope === "series" && !!booking.seriesId) ||
      holders(booking).some((h) => h.email.toLowerCase() !== actor.email.toLowerCase()) ||
      booking.requests.some((r) => r.status === "pending");
    if (!(await beforeWrite(willEmail))) return fail(429, "Too many emails");
  }

  const now = new Date().toISOString();
  const mayCancel = (b: RoomBooking) => isHolder(b, actor.id) || canManageRooms(actor);
  const cancel = (b: RoomBooking): RoomBooking =>
    touch(b, { status: "cancelled", requests: withdrawAll(b, now), cancelledAt: now, cancelledByName: actor.name });
  let count = 0;
  let skipped = 0;
  /** As they were before cancelling, for the emails. */
  const cancelled: RoomBooking[] = [];

  if (scope === "series" && booking.seriesId) {
    const from = booking.date;
    const months = await monthsFrom(roomId, monthOf(from));
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
      skipped += k;
      cancelled.push(...hit);
    }
    // Counted by booking, not by row: a half-moved one is in two files.
    const unique = dedupeById(cancelled);
    cancelled.length = 0;
    cancelled.push(...unique);
    count = unique.length;
    // Nothing cancelled: because the caller holds none of what is left (403),
    // or because what is left was already cancelled or has ended (409).
    if (count === 0) return skipped > 0 ? fail(403, "Only the people holding this room can cancel it") : fail(409, "Nothing left to cancel in this series");
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
    const bad = failure(error);
    if (bad) return bad;
  }
  return { ok: true, value: { booking, count, skipped, cancelled, withdrawn: cancelled.flatMap((b) => pendingWithdrawals(b, "cancelled")) } };
}

// --- Ask the holder for the room --------------------------------------------------

/** Makes a request's pointer name the month its booking is really in now:
 *  it may have moved between the request and the pointer being written. */
async function fixPointer(roomId: string, bookingId: string, token: string): Promise<void> {
  const ptr = await readJson<RequestPointer | null>(requestPath(token), null);
  const holds = async (m: string) => (await readMonthRaw(roomId, m)).some((b) => b.id === bookingId && b.requests.some((q) => q.token === token));
  if (ptr && (await holds(ptr.month))) return;
  for (const m of await monthsFrom(roomId, monthOf(addDays(sastToday(), -62)))) {
    if (await holds(m)) {
      await writeJson<RequestPointer>(requestPath(token), { roomId, month: m, bookingId });
      return;
    }
  }
}

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
  // While a move of this booking is in flight its old copy is about to go, so
  // a request landing there could be lost. Refuse until it has settled.
  if (booking.moving || (await pendingMoveFor(roomId, id))) return fail(409, BEING_CHANGED);

  // One live request per person per SERIES, not per occurrence: asking for
  // each of 52 weekly meetings would be 52 emails to the same holder.
  const token = crypto.randomUUID();
  if (booking.seriesId && !(await claimSeriesAsk(booking.seriesId, actor.id, token, nowAt.getTime()))) {
    return fail(409, "You've already asked for a meeting in this series. Waiting on their reply.");
  }

  const request: RoomRequest = {
    token,
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
  const release = async () => {
    if (booking.seriesId) await releaseSeriesAsk(booking.seriesId, actor.id, token).catch(() => {});
  };
  try {
    await updateJson<RoomBooking[]>(fileFor(roomId, monthOf(booking.date)), [], (list) => {
      error = null;
      const cur = list.find((b) => b.id === id);
      if (!cur || cur.status !== "confirmed") {
        error = { status: 404, error: "That booking is no longer live" };
        return NO_CHANGE;
      }
      if (cur.moving) {
        error = { status: 409, error: BEING_CHANGED };
        return NO_CHANGE;
      }
      // One live request per person per booking, so nobody can flood an inbox.
      if (cur.requests.some((r) => r.requesterId === actor.id && r.status === "pending")) {
        error = { status: 409, error: "You've already asked for this one. Waiting on their reply." };
        return NO_CHANGE;
      }
      live = touch(cur, { requests: [...cur.requests, request] });
      return list.map((b) => (b.id === id ? live : b));
    });
    const bad = failure(error);
    if (bad) {
      // The ask did not happen: hand the series marker back at once.
      await release();
      return bad;
    }
    // The pointer goes AFTER the request is stored, so a refusal leaves no
    // pointer behind. If it cannot be written, the request is taken back out:
    // a request nobody can open from its link must not exist.
    try {
      // Where the request was written; if a move of this booking is in flight,
      // its target (the move rewrites pointers when it settles, but may have
      // done so a moment before this request landed). Checked again below.
      const move = await pendingMoveFor(roomId, id);
      await writeJson<RequestPointer>(requestPath(request.token), { roomId, month: move?.month ?? monthOf(booking.date), bookingId: id });
      await fixPointer(roomId, id, token);
    } catch (err) {
      await updateJson<RoomBooking[]>(fileFor(roomId, monthOf(booking.date)), [], (list) =>
        list.some((b) => b.requests.some((q) => q.token === token))
          ? list.map((b) => (b.id === id ? touch(b, { requests: b.requests.filter((q) => q.token !== token) }) : b))
          : NO_CHANGE
      ).catch(() => {});
      throw err;
    }
    return { ok: true, value: { booking: live, room, request } };
  } catch (err) {
    await release();
    throw err;
  }
}

// --- One live ask per person per series -------------------------------------------
//
// A marker file per series per person names their live request. Claiming it is
// ONE updateJson, so two asks at once cannot both pass. A failed ask releases
// its marker straight away; a marker whose request is no longer pending
// (answered, withdrawn, or the meeting started) is taken over, and one whose
// request cannot be found holds for SERIES_ASK_GRACE_MS, in case it is still
// being written.

const seriesAskPath = (seriesId: string, userId: string) => `rooms/requests-by-series/${seriesId}/${userId}.json`;

interface SeriesAsk {
  token: string;
  /** ms. While the ask is still being written, its request cannot be found yet. */
  at: number;
}

/** A marker whose request is not written yet counts as live this long. */
export const SERIES_ASK_GRACE_MS = 2 * 60_000;

/** "pending": a live ask. "over": answered or withdrawn. "missing": not found
 *  (not written yet, or the ask failed). */
async function askState(token: string, now: Date = new Date()): Promise<"pending" | "over" | "missing"> {
  const ptr = await readJson<RequestPointer | null>(requestPath(token), null);
  if (!ptr) return "missing";
  const b = (await readMonth(ptr.roomId, ptr.month)).find((x) => x.id === ptr.bookingId);
  const req = b?.requests.find((r) => r.token === token);
  if (!b || !req) return "missing";
  // A meeting that has started can no longer be handed over, so its unanswered ask is over too.
  return b.status === "confirmed" && req.status === "pending" && !isPast(b.date, b.startMinute, now) ? "pending" : "over";
}

/** 🔴 Taken over ONLY when its request is definitely not pending: answered
 *  or withdrawn, or still not found after the grace period (a failed ask). A
 *  marker claimed a moment ago, whose request is still being written, holds. */
async function claimSeriesAsk(seriesId: string, userId: string, token: string, now: number = Date.now()): Promise<boolean> {
  let claimed = false;
  await updateJson<SeriesAsk | null>(seriesAskPath(seriesId, userId), null, async (cur) => {
    claimed = false;
    if (cur?.token) {
      const state = await askState(cur.token, new Date(now));
      if (state === "pending") return NO_CHANGE;
      if (state === "missing" && now - (cur.at ?? 0) < SERIES_ASK_GRACE_MS) return NO_CHANGE;
    }
    claimed = true;
    return { token, at: now };
  });
  return claimed;
}

async function releaseSeriesAsk(seriesId: string, userId: string, token: string): Promise<void> {
  await updateJson<SeriesAsk | null>(seriesAskPath(seriesId, userId), null, (cur) => (cur?.token === token ? null : NO_CHANGE));
}

/** Withdraws one pending request (and frees its series marker). Used when no
 *  holder could be emailed about it. Returns it as a withdrawal, or null. */
export async function withdrawRequest(token: string, reason: WithdrawReason): Promise<Withdrawal | null> {
  const ptr = await readJson<RequestPointer | null>(requestPath(token), null);
  if (!ptr) return null;
  let w: Withdrawal | null = null;
  await updateJson<RoomBooking[]>(fileFor(ptr.roomId, ptr.month), [], (list) => {
    w = null;
    const b = list.find((x) => x.id === ptr.bookingId);
    const req = b?.requests.find((q) => q.token === token && q.status === "pending");
    if (!b || !req) return NO_CHANGE;
    w = { booking: b, request: req, reason };
    return list.map((x) => (x === b ? touch(x, { requests: withdrawAll(x, new Date().toISOString(), (q) => q.token !== token) }) : x));
  });
  const done = w as Withdrawal | null;
  if (done?.booking.seriesId) await releaseSeriesAsk(done.booking.seriesId, done.request.requesterId, token).catch(() => {});
  return done;
}

/** Upcoming (not yet started) confirmed bookings in a room. */
export async function upcomingBookings(roomId: string, now: Date = new Date()): Promise<RoomBooking[]> {
  const lists = await Promise.all((await monthsFrom(roomId, monthOf(sastToday(now)))).map((m) => readMonth(roomId, m)));
  return lists.flat().filter((b) => b.status === "confirmed" && !isPast(b.date, b.startMinute, now));
}

export interface RequestView {
  booking: RoomBooking;
  request: RoomRequest;
  room: Room | null;
  canAnswer: boolean;
  /** The meeting has started: nobody can answer any more. */
  started: boolean;
  /** Seen by someone who answered it but no longer holds it: outcome only. */
  readOnly: boolean;
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
  // Access: whoever holds the booking NOW, the requester, room managers. A
  // holder who has since handed it over loses access, except that whoever
  // answered may still see the outcome (read only, without the message).
  const isRequester = request.requesterId === actor.id;
  const holdsNow = isHolder(booking, actor.id);
  const answeredIt = request.answeredById === actor.id;
  const manager = canManageRooms(actor);
  if (!isRequester && !holdsNow && !manager && !answeredIt) return fail(403, "Only the people holding this room can answer this");
  const readOnly = !isRequester && !holdsNow && !manager;
  const started = isPast(booking.date, booking.startMinute);
  const canAnswer = !readOnly && request.status === "pending" && !started && mayAnswer(actor, booking, request);
  const viewerRole = isRequester ? "requester" : holdsNow || answeredIt ? "holder" : "manager";
  return { ok: true, value: { booking, request, room: await getRoom(ptr.roomId), canAnswer, started, viewerRole, readOnly } };
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

  // Approving makes the requester the holder: they must still exist and still
  // be allowed to book, and their headcount must fit the room as it is now.
  let requesterUnable = false;
  let capacity = Infinity;
  if (decision === "approve") {
    const req = (await readMonth(ptr.roomId, ptr.month)).find((b) => b.id === ptr.bookingId)?.requests.find((r) => r.token === token);
    if (req) requesterUnable = !(await userCanBook(req.requesterId));
    capacity = (await getRoom(ptr.roomId))?.capacity ?? Infinity;
  }

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
      // Every pending ask on a started meeting lapses, not only this one.
      lapsed = pendingWithdrawals(cur, "lapsed");
      return list.map((b) => (b.id === cur.id ? touch(b, { requests: withdrawAll(b, now) }) : b));
    }
    if (decision === "approve" && requesterUnable) {
      error = { status: 409, error: "The person who asked can no longer book rooms, so their request has been withdrawn." };
      lapsed = pendingWithdrawals(cur, "requester_unable", (r) => r.token !== token);
      return list.map((b) => (b.id === cur.id ? touch(b, { requests: withdrawAll(b, now, (r) => r.token !== token) }) : b));
    }
    if (decision === "approve" && req.attendeeCount > capacity) {
      // Left pending: the holder can still decline it, or the room may be changed back.
      error = { status: 409, error: `They asked for ${req.attendeeCount} people, but the room now seats ${capacity}.` };
      return NO_CHANGE;
    }
    answered = decision === "approve"
      ? { ...req, status: "approved", respondedAt: now, answeredById: actor.id }
      : { ...req, status: "declined", declineReason: reason.trim().slice(0, 1000), respondedAt: now, answeredById: actor.id };
    // Approving gives the slot away, so every other pending ask for it lapses.
    const requests = (decision === "approve" ? withdrawAll(cur, now, (r) => r.token === token) : cur.requests).map((r) =>
      r.token === token ? answered! : r
    );
    withdrawn = decision === "approve" ? pendingWithdrawals(cur, "given_away", (r) => r.token === token) : [];
    onBehalf = !isHolder(cur, actor.id);
    before = cur;
    after =
      decision === "approve"
        ? touch(cur, {
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
            remindedEmails: [],
            requests,
          })
        : touch(cur, { requests });
    return list.map((b) => (b.id === cur.id ? after! : b));
  });
  const bad = failure(error);
  if (bad) return { ...bad, withdrawn: lapsed };
  return { ok: true, value: { before: before!, after: after!, request: answered!, room: await getRoom(ptr.roomId), onBehalf, withdrawn } };
}

// --- Reminders ------------------------------------------------------------------------

/** Bookings to remind now: confirmed, not reminded to every holder, and
 *  starting before an hour after the next run (see remindCutoffMs). A holder
 *  whose send failed stays due, so the next run (if the meeting has not
 *  started) tries them again. */
export async function bookingsDueForReminder(now: Date = new Date()): Promise<{ booking: RoomBooking; room: Room }[]> {
  const today = sastToday(now);
  const out: { booking: RoomBooking; room: Room }[] = [];
  // A retired room has no calendar; its upcoming bookings were cancelled on retiring.
  const rooms = (await getRooms()).filter((r) => r.active);
  const months = [...new Set([today, addDays(today, 1), addDays(today, 2)].map(monthOf))];
  const cutoff = remindCutoffMs(now);
  const lists = await Promise.all(rooms.flatMap((room) => months.map(async (m) => ({ room, list: await readMonth(room.id, m) }))));
  for (const { room, list } of lists) {
    for (const b of list) {
      if (b.status !== "confirmed" || b.pendingApproval) continue;
      // Done once every holder has it. A claim with no finish after
      // REMINDER_CLAIM_STALE_MS is a run that died mid-send: due again, and
      // only the holders not yet reminded are sent it.
      const reached = new Set((b.remindedEmails ?? []).map((e) => e.toLowerCase()));
      if (holders(b).every((h) => reached.has(h.email.toLowerCase()))) continue;
      if (b.reminderSentAt && now.getTime() - Date.parse(b.reminderSentAt) < REMINDER_CLAIM_STALE_MS) continue;
      // From now until an hour after the next run. A meeting that started in the
      // last REMIND_LATE_GRACE_MS without every holder reminded (the cron fired
      // late for a 07:00 meeting, or a send failed) still gets it, for the
      // holders not yet reached; anything older is too late.
      const at = startsAtMs(b.date, b.startMinute);
      if (at < cutoff && at > now.getTime() - REMIND_LATE_GRACE_MS) out.push({ booking: b, room });
    }
  }
  return out;
}

/** A meeting this recently started, never reminded, is still reminded. */
export const REMIND_LATE_GRACE_MS = 45 * 60_000; // Vercel can fire the 07:00 cron up to ~30 min late

/** A reminder claim this old without its finish is a run that died. */
export const REMINDER_CLAIM_STALE_MS = 15 * 60_000;

/** Pending requests on meetings that have started can never be answered:
 *  lapse them (one atomic write per month file), for the cron to email. */
export async function lapseStartedRequests(now: Date = new Date()): Promise<{ withdrawn: Withdrawal[]; room: Room }[]> {
  const today = sastToday(now);
  const months = [...new Set([addDays(today, -31), today].map(monthOf))];
  const out: { withdrawn: Withdrawal[]; room: Room }[] = [];
  const due = (b: RoomBooking) => b.status === "confirmed" && b.requests.some((r) => r.status === "pending") && isPast(b.date, b.startMinute, now);
  // Read every room's months at once; write only the files that hold one.
  const reads = await Promise.all((await getRooms()).flatMap((room) => months.map(async (m) => ({ room, m, list: await readMonthRaw(room.id, m) }))));
  for (const { room, m } of reads.filter((r) => r.list.some(due))) {
    let hit: Withdrawal[] = [];
    await updateJson<RoomBooking[]>(fileFor(room.id, m), [], (list) => {
      hit = [];
      const stamp = new Date().toISOString();
      const next = list.map((b) => {
        if (!due(b)) return b;
        hit.push(...pendingWithdrawals(b, "lapsed"));
        return touch(b, { requests: withdrawAll(b, stamp) });
      });
      return hit.length ? next : NO_CHANGE;
    });
    if (hit.length) out.push({ withdrawn: hit, room });
  }
  return out;
}

/** After sending: records who it reached. Done only when every holder has it;
 *  otherwise the stamp is handed back so the next run retries the rest. */
export async function finishReminder(b: RoomBooking, stamp: string, remindedEmails: string[], allDone: boolean): Promise<void> {
  await updateJson<RoomBooking[]>(fileFor(b.roomId, monthOf(b.date)), [], (list) => {
    const cur = list.find((x) => x.id === b.id);
    if (!cur || cur.reminderSentAt !== stamp) return NO_CHANGE;
    return list.map((x) => (x.id === b.id ? touch(x, { remindedEmails, reminderSentAt: allDone ? stamp : null }) : x));
  });
}

/** Stamps the reminder BEFORE sending, in one guarded write, so two
 *  overlapping cron runs cannot both send it. Returns false if already taken. */
export async function claimReminder(b: RoomBooking, stamp: string | null, onlyIf: string | null): Promise<boolean> {
  let claimed = false;
  await updateJson<RoomBooking[]>(fileFor(b.roomId, monthOf(b.date)), [], (list) => {
    claimed = false;
    const cur = list.find((x) => x.id === b.id);
    if (!cur || cur.reminderSentAt !== onlyIf) return NO_CHANGE;
    // Claiming (not handing back) also needs the row to be what the caller
    // read: still confirmed, same day, start and holders. Otherwise the email
    // it is about to send would be about a booking that no longer looks so.
    if (stamp !== null) {
      const who = (x: RoomBooking) => holders(x).map((h) => h.email.toLowerCase()).sort().join(",");
      if (cur.status !== "confirmed" || cur.date !== b.date || cur.startMinute !== b.startMinute || who(cur) !== who(b)) return NO_CHANGE;
    }
    claimed = true;
    return list.map((x) => (x.id === b.id ? touch(x, { reminderSentAt: stamp }) : x));
  });
  return claimed;
}

// --- Guest bookings from a room's public link ---------------------------------

/** What the public calendar may show: when the room is taken, nothing else. */
export async function takenSlots(roomId: string, from: string, to: string): Promise<{ date: string; startMinute: number; endMinute: number }[]> {
  return (await bookingsBetween(roomId, from, to)).map((b) => ({ date: b.date, startMinute: b.startMinute, endMinute: b.endMinute }));
}

/** Approve clears the hold; the caller emails the guest. */
export async function approveGuestBooking(actor: Actor, roomId: string, date: string, id: string): Promise<Outcome<RoomBooking>> {
  if (!canManageRooms(actor)) return fail(403, "Only room managers can approve a booking");
  if (!isId(roomId) || !isId(id) || !isDate(date)) return fail(400, "That booking no longer exists");
  let found: RoomBooking | null = null;
  await updateJson<RoomBooking[]>(fileFor(roomId, monthOf(date)), [], (list) => {
    const i = list.findIndex((b) => b.id === id && b.status === "confirmed" && b.pendingApproval);
    if (i < 0) return NO_CHANGE;
    found = touch(list[i], { pendingApproval: false });
    return list.map((b, j) => (j === i ? found! : b));
  });
  return found ? { ok: true, value: found } : fail(404, "That booking is no longer waiting for approval");
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A booking from the public link: one date, no repeat, nobody else on it. */
export function parseGuestBooking(body: unknown): Parsed<{ input: BookingInput; guest: GuestDetails }> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const booking = parseBookingInput({ ...b, bookedForId: "", recurrence: null });
  if (!booking.ok) return booking;
  const fields: [keyof GuestDetails, number, boolean, string][] = [
    ["name", 100, true, "Your name"],
    ["organisation", 120, false, "Organisation"],
    ["email", 200, true, "Email"],
    ["phone", 30, true, "Phone"],
  ];
  const guest = {} as GuestDetails;
  for (const [k, max, req, label] of fields) {
    const v = text(b[k], max, req, label);
    if (typeof v !== "string") return { ok: false, ...v };
    guest[k] = v;
  }
  if (!EMAIL.test(guest.email)) return { ok: false, error: "Enter a valid email address" };
  // POPIA: we keep their contact details, so they must agree to it.
  if (b.consent !== true) return { ok: false, error: "Tick the box to agree to how we use your details" };
  return { ok: true, value: { input: booking.value, guest } };
}
