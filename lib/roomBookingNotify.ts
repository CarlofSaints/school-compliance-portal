import {
  sendBookingConfirmedEmail,
  sendBookingGivenAwayEmail,
  sendBookingHandedOverEmail,
  sendBookingReminderEmail,
  sendBookingsCancelledEmail,
  sendBookingTakenOverEmail,
  sendRoomRequestApprovedEmail,
  sendRoomRequestDeclinedEmail,
  sendRoomRequestEmail,
  sendRoomRequestWithdrawnEmail,
  type RoomBookingEmailFacts,
} from "./email";
import {
  bookingsDueForReminder,
  claimReminder,
  holderLabel,
  holders,
  isHolder,
  pendingWithdrawals,
  type Room,
  type RoomBooking,
  type RoomRequest,
  type Withdrawal,
  type WithdrawReason,
} from "./roomBookingData";
import { describeRecurrence, longDateLabel, slotLabel } from "./roomBookings";

// The booking emails COLAB sends, wired to the portal's mailer. Each returns
// false (or a failure count) when a message that was due did not go, so the
// route can say so rather than imply somebody was told. Nobody outside the
// booking is ever written to.

function facts(b: RoomBooking, room: Room): RoomBookingEmailFacts {
  return {
    roomName: room.name,
    title: b.title,
    dateLabel: longDateLabel(b.date),
    timeLabel: slotLabel(b.startMinute, b.endMinute),
    attendeeCount: b.attendeeCount,
    bookedForName: b.bookedForName,
    bookedByName: b.bookedByName,
    recurrenceLabel: b.recurrence ? describeRecurrence(b.recurrence) : null,
    occurrences: b.occurrences,
  };
}

// Bulk sends are paced like the weekly update and the action summary (600 ms
// apart), so a room with many bookings does not hit the provider all at once.
const SEND_GAP_MS = 600;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sends one after another, paced. Returns how many failed. */
async function sendPaced(jobs: (() => Promise<boolean>)[]): Promise<number> {
  let failed = 0;
  for (let i = 0; i < jobs.length; i++) {
    if (i > 0) await sleep(SEND_GAP_MS);
    if (!(await jobs[i]())) failed++;
  }
  return failed;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Groups bookings by each holder's address: one entry per person. */
function byHolder(bookings: RoomBooking[], skipEmail?: string): Map<string, { name: string; bookings: RoomBooking[] }> {
  const out = new Map<string, { name: string; bookings: RoomBooking[] }>();
  for (const b of bookings) {
    for (const h of holders(b)) {
      if (skipEmail && same(h.email, skipEmail)) continue;
      const key = h.email.toLowerCase();
      const entry = out.get(key) ?? { name: h.name, bookings: [] };
      entry.bookings.push(b);
      out.set(key, entry);
    }
  }
  return out;
}

const line = (b: RoomBooking) => `${longDateLabel(b.date)}, ${slotLabel(b.startMinute, b.endMinute)}: ${b.title}`;

const WHY: Record<WithdrawReason, string> = {
  cancelled: "the booking was cancelled",
  moved: "the booking was moved to a different time",
  given_away: "the room was given to someone else who asked",
  lapsed: "the meeting time has passed",
  room_retired: "the room is no longer available",
};

/** One email per withdrawn request, to its requester, saying why. Returns
 *  how many failed. */
export async function notifyWithdrawn(withdrawn: Withdrawal[], room: Room | null): Promise<number> {
  const name = room?.name ?? "the room";
  return sendPaced(
    withdrawn.map((w) => () =>
      sendRoomRequestWithdrawnEmail(w.request.requesterEmail, w.request.requesterName, WHY[w.reason], {
        roomName: name,
        dateLabel: longDateLabel(w.booking.date),
        timeLabel: slotLabel(w.booking.startMinute, w.booking.endMinute),
      })
    )
  );
}

/** Confirmation to both holders, once per booking or series. */
export async function notifyBookingCreated(first: RoomBooking, room: Room): Promise<boolean> {
  let ok = true;
  for (const h of holders(first)) {
    if (!(await sendBookingConfirmedEmail(h.email, h.name, facts(first, room)))) ok = false;
  }
  return ok;
}

/** A retired room's upcoming bookings were cancelled: ONE email per holder
 *  listing their dates, then one per withdrawn request. Returns how many
 *  messages failed. */
export async function notifyRoomRetired(cancelled: RoomBooking[], room: Room): Promise<number> {
  const jobs = [...byHolder(cancelled)].map(([email, h]) => () =>
    sendBookingsCancelledEmail(email, h.name, room.name, "room_retired", "", h.bookings.map(line))
  );
  const failed = await sendPaced(jobs);
  return failed + (await notifyWithdrawn(cancelled.flatMap((b) => pendingWithdrawals(b, "room_retired")), room));
}

/** Someone who does not hold a booking (a room manager) cancelled it: ONE
 *  email per holder, the person it was for included. Returns failures. */
export async function notifyCancelledByOther(cancelled: RoomBooking[], room: Room, by: { id: string; name: string; email: string }): Promise<number> {
  const notMine = cancelled.filter((b) => !isHolder(b, by.id));
  const jobs = [...byHolder(notMine, by.email)].map(([email, h]) => () =>
    sendBookingsCancelledEmail(email, h.name, room.name, "by_manager", by.name, h.bookings.map(line))
  );
  return sendPaced(jobs);
}

/** An edit changed who the room is for: tell both sides, except whoever made
 *  the change (they know). */
export async function notifyHandover(before: RoomBooking, after: RoomBooking, room: Room, changedBy: { name: string; email: string }): Promise<boolean> {
  const prev = { name: before.bookedForName || before.bookedByName, email: before.bookedForEmail || before.bookedByEmail };
  const next = { name: after.bookedForName || after.bookedByName, email: after.bookedForEmail || after.bookedByEmail };
  let ok = true;
  if (!same(next.email, changedBy.email)) {
    if (!(await sendBookingHandedOverEmail(next.email, next.name, prev.name, changedBy.name, facts(after, room)))) ok = false;
  }
  if (!same(prev.email, changedBy.email) && !same(prev.email, next.email)) {
    const stillHolderAsBooker = before.bookedForEmail === null;
    if (!(await sendBookingTakenOverEmail(prev.email, prev.name, next.name, changedBy.name, stillHolderAsBooker, facts(after, room)))) ok = false;
  }
  return ok;
}

/** The ask goes to both holders; either may answer. True if anyone got it. */
export async function notifyRoomRequest(b: RoomBooking, room: Room, r: RoomRequest): Promise<boolean> {
  let delivered = false;
  const f = facts(b, room);
  for (const h of holders(b)) {
    if (await sendRoomRequestEmail(h.email, h.name, r.requesterName, r.title, r.message, b.title, r.token, f)) delivered = true;
  }
  return delivered;
}

/** The answer, to the requester. When a room manager approved on the holders'
 *  behalf, the holders are told too: their booking has gone. */
export async function notifyRequestOutcome(
  before: RoomBooking,
  after: RoomBooking,
  room: Room | null,
  r: RoomRequest,
  by?: { name: string; email: string; onBehalf: boolean }
): Promise<boolean> {
  const f = { roomName: room?.name ?? "the room", dateLabel: longDateLabel(before.date), timeLabel: slotLabel(before.startMinute, before.endMinute) };
  let ok =
    r.status === "approved"
      ? await sendRoomRequestApprovedEmail(r.requesterEmail, r.requesterName, holderLabel(before), { ...f, title: after.title })
      : await sendRoomRequestDeclinedEmail(r.requesterEmail, r.requesterName, holderLabel(before), r.declineReason || "", f);
  if (r.status === "approved" && by?.onBehalf && room) {
    for (const h of holders(before)) {
      if (same(h.email, by.email)) continue;
      if (!(await sendBookingGivenAwayEmail(h.email, h.name, by.name, r.requesterName, facts(before, room)))) ok = false;
    }
  }
  return ok;
}

/** The day-before reminder, run from the daily cron. Claimed before sending so
 *  overlapping runs cannot double-send; handed back if nothing was delivered,
 *  so a re-run the same day tries again. */
export async function runRoomBookingReminders(now: Date = new Date()): Promise<{ due: number; sent: number; failed: number; detail: string[] }> {
  const due = await bookingsDueForReminder(now);
  let sent = 0;
  let failed = 0;
  const detail: string[] = [];
  for (const { booking, room } of due) {
    const stamp = now.toISOString();
    if (!(await claimReminder(booking, stamp, null))) {
      detail.push(`Room ${room.name} "${booking.title}": already reminded by another run`);
      continue;
    }
    let ok = 0;
    for (const h of holders(booking)) {
      if (await sendBookingReminderEmail(h.email, h.name, facts(booking, room))) ok++;
      else failed++;
    }
    sent += ok;
    if (ok === 0) await claimReminder(booking, null, stamp).catch(() => false);
    detail.push(`Room ${room.name} "${booking.title}" ${booking.date}: reminder sent to ${ok} of ${holders(booking).length}`);
  }
  return { due: due.length, sent, failed, detail };
}
