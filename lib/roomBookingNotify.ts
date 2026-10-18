import {
  sendBookingChangedEmail,
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
  settleStaleMoves,
  lapseStartedRequests,
  finishReminder,
  holderLabel,
  holders,
  pendingWithdrawals,
  type Room,
  type RoomBooking,
  type RoomRequest,
  type Withdrawal,
  type WithdrawReason,
} from "./roomBookingData";
import { describeRecurrence, longDateLabel, nextReminderRunMs, sastToday, slotLabel, startsAtMs } from "./roomBookings";
import { pause, sendPaced } from "./actionItemNotify";

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

// Bulk sends use the action items' paced sender (600 ms apart), so a room with
// many bookings does not hit the provider all at once.

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
  requester_unable: "you can no longer book rooms in the portal",
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

/** Bookings were cancelled: ONE email to each holder other than whoever did
 *  it (Jane cancelling what she booked for Sarah tells Sarah; a room manager
 *  tells both). Returns failures. */
export async function notifyCancelledByOther(cancelled: RoomBooking[], room: Room, by: { id: string; name: string; email: string }): Promise<number> {
  const jobs = [...byHolder(cancelled, by.email)].map(([email, h]) => () =>
    sendBookingsCancelledEmail(email, h.name, room.name, "by_manager", by.name, h.bookings.map(line))
  );
  return sendPaced(jobs);
}

/** What an edit changed, as lines for the email ("When: was X, now Y"). */
export function editChanges(before: RoomBooking, after: RoomBooking): string[] {
  const out: string[] = [];
  const when = (b: RoomBooking) => `${longDateLabel(b.date)}, ${slotLabel(b.startMinute, b.endMinute)}`;
  if (before.title !== after.title) out.push(`Meeting: was "${before.title}", now "${after.title}"`);
  if (before.date !== after.date || before.startMinute !== after.startMinute || before.endMinute !== after.endMinute)
    out.push(`When: was ${when(before)}, now ${when(after)}`);
  if (before.attendeeCount !== after.attendeeCount) out.push(`Attendees: was ${before.attendeeCount}, now ${after.attendeeCount}`);
  return out;
}

/** An edit to the title, time or headcount: ONE email, old vs new, to every
 *  holder other than the editor (the other holder of a two-holder booking, or
 *  both when a room manager edited). Someone already getting a hand-over email
 *  for this edit is not sent this as well. Returns failures. */
export async function notifyEdited(
  before: RoomBooking,
  after: RoomBooking,
  room: Room,
  editor: { name: string; email: string },
  holderChanged: boolean
): Promise<number> {
  const changes = editChanges(before, after);
  if (changes.length === 0) return 0;
  const handedOver = holderChanged ? new Set([before, after].map((b) => (b.bookedForEmail || b.bookedByEmail).toLowerCase())) : new Set<string>();
  const to = holders(after).filter((h) => !same(h.email, editor.email) && !handedOver.has(h.email.toLowerCase()));
  return sendPaced(to.map((h) => () => sendBookingChangedEmail(h.email, h.name, editor.name, changes, facts(after, room))));
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

/** Who the requester is told answered (gave them the room, or declined): the
 *  holder, or, when a room manager answered on the holder's behalf, that manager. */
export function giverName(before: RoomBooking, by?: { name: string; onBehalf: boolean }): string {
  return by?.onBehalf ? `${by.name} (a room manager)` : holderLabel(before);
}

/** The answer, to the requester. On an approve, every holder other than the
 *  one who answered is told too (the booker when the bookee approved, both
 *  when a room manager did): their booking has gone. */
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
      ? await sendRoomRequestApprovedEmail(r.requesterEmail, r.requesterName, giverName(before, by), { ...f, title: after.title })
      : await sendRoomRequestDeclinedEmail(r.requesterEmail, r.requesterName, giverName(before, by), r.declineReason || "", f);
  if (r.status === "approved" && by && room) {
    for (const h of holders(before)) {
      if (same(h.email, by.email)) continue;
      if (!(await sendBookingGivenAwayEmail(h.email, h.name, by.name, r.requesterName, facts(before, room)))) ok = false;
    }
  }
  return ok;
}

/** Lapses unanswerable requests on meetings that have started, and tells each
 *  requester. Run from the daily cron. */
export async function runRequestLapses(now: Date = new Date()): Promise<{ lapsed: number; failed: number; detail: string[] }> {
  let lapsed = 0;
  let failed = 0;
  const detail: string[] = [];
  for (const { withdrawn, room } of await lapseStartedRequests(now)) {
    lapsed += withdrawn.length;
    failed += await notifyWithdrawn(withdrawn, room);
    detail.push(`Room ${room.name}: ${withdrawn.length} unanswered request(s) lapsed, the meeting had started`);
  }
  return { lapsed, failed, detail };
}

/** A meeting that starts before the next reminder run would never be
 *  reminded by the cron: send its reminder now, at booking time. */
export async function remindNowIfBeforeNextRun(booking: RoomBooking, room: Room, now: Date = new Date()): Promise<boolean> {
  const at = startsAtMs(booking.date, booking.startMinute);
  if (!(at > now.getTime() && at < nextReminderRunMs(now))) return false;
  const stamp = now.toISOString();
  if (!(await claimReminder(booking, stamp, null))) return false;
  const reached: string[] = [];
  for (const h of holders(booking)) {
    if (reached.length) await pause();
    if (await sendBookingReminderEmail(h.email, h.name, facts(booking, room), booking.date === sastToday(now) ? "today" : "tomorrow")) reached.push(h.email.toLowerCase());
  }
  await finishReminder(booking, stamp, reached, reached.length === holders(booking).length);
  return true;
}

/** Settles cross-month moves a dead request left half done. Run from the cron. */
export async function runSettleMoves(now: Date = new Date()): Promise<string[]> {
  const r = await settleStaleMoves(now);
  return r.rolledBack + r.finished ? [`Room bookings: ${r.rolledBack} half-done move(s) rolled back, ${r.finished} finished`] : [];
}

/** The reminder, run from the daily cron (see remindCutoffMs for which bookings). Claimed before sending so
 *  overlapping runs cannot double-send; handed back if nothing was delivered,
 *  so a re-run the same day tries again. */
export async function runRoomBookingReminders(now: Date = new Date()): Promise<{ due: number; sent: number; failed: number; detail: string[] }> {
  const due = await bookingsDueForReminder(now);
  let sent = 0;
  let failed = 0;
  const detail: string[] = [];
  for (const { booking, room } of due) {
    const stamp = now.toISOString();
    // Claimed against the stamp it has now: none, or a stale one from a run that died.
    if (!(await claimReminder(booking, stamp, booking.reminderSentAt ?? null))) {
      detail.push(`Room ${room.name} "${booking.title}": already reminded by another run`);
      continue;
    }
    // Per holder: someone already reminded is not sent it again on a retry.
    const reached = new Set((booking.remindedEmails ?? []).map((e) => e.toLowerCase()));
    const todo = holders(booking).filter((h) => !reached.has(h.email.toLowerCase()));
    let ok = 0;
    for (let i = 0; i < todo.length; i++) {
      if (i > 0 || sent + failed > 0) await pause();
      if (await sendBookingReminderEmail(todo[i].email, todo[i].name, facts(booking, room), booking.date === sastToday(now) ? "today" : "tomorrow")) {
        ok++;
        reached.add(todo[i].email.toLowerCase());
      } else failed++;
    }
    sent += ok;
    const allDone = holders(booking).every((h) => reached.has(h.email.toLowerCase()));
    await finishReminder(booking, stamp, [...reached], allDone);
    detail.push(
      `Room ${room.name} "${booking.title}" ${booking.date}: reminder sent to ${ok} of ${todo.length}` +
        (allDone ? "" : ", the rest are tried again on the next run if the meeting has not started")
    );
  }
  return { due: due.length, sent, failed, detail };
}
