import {
  sendBookingConfirmedEmail,
  sendBookingHandedOverEmail,
  sendBookingReminderEmail,
  sendBookingTakenOverEmail,
  sendRoomRequestApprovedEmail,
  sendRoomRequestDeclinedEmail,
  sendRoomRequestEmail,
  type RoomBookingEmailFacts,
} from "./email";
import {
  bookingsDueForReminder,
  claimReminder,
  holderLabel,
  holders,
  type Room,
  type RoomBooking,
  type RoomRequest,
} from "./roomBookingData";
import { describeRecurrence, longDateLabel, slotLabel } from "./roomBookings";

// The booking emails COLAB sends, wired to the portal's mailer. Each returns
// false when a message that was due did not go, so the route can say so rather
// than imply somebody was told. Nobody outside the booking is ever written to.

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

/** Confirmation to both holders, once per booking or series. */
export async function notifyBookingCreated(first: RoomBooking, room: Room): Promise<boolean> {
  let ok = true;
  for (const h of holders(first)) {
    if (!(await sendBookingConfirmedEmail(h.email, h.name, facts(first, room)))) ok = false;
  }
  return ok;
}

/** An edit changed who the room is for: tell both sides, except whoever made
 *  the change (they know). */
export async function notifyHandover(before: RoomBooking, after: RoomBooking, room: Room, changedBy: { name: string; email: string }): Promise<boolean> {
  const prev = { name: before.bookedForName || before.bookedByName, email: before.bookedForEmail || before.bookedByEmail };
  const next = { name: after.bookedForName || after.bookedByName, email: after.bookedForEmail || after.bookedByEmail };
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
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

/** The answer, to the requester only. */
export async function notifyRequestOutcome(before: RoomBooking, after: RoomBooking, room: Room | null, r: RoomRequest): Promise<boolean> {
  const f = { roomName: room?.name ?? "the room", dateLabel: longDateLabel(before.date), timeLabel: slotLabel(before.startMinute, before.endMinute) };
  return r.status === "approved"
    ? sendRoomRequestApprovedEmail(r.requesterEmail, r.requesterName, holderLabel(before), { ...f, title: after.title })
    : sendRoomRequestDeclinedEmail(r.requesterEmail, r.requesterName, holderLabel(before), r.declineReason || "", f);
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
