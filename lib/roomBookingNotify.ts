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
  sendGuestBookingApprovedEmail,
  sendGuestBookingDeclinedEmail,
  sendGuestBookingToApproveEmail,
  type RoomBookingEmailFacts,
} from "./email";
import { getUsers } from "./userData";
import { getRoles, resolveRolePermissions } from "./rolesData";
import {
  bookingsDueForReminder,
  claimReminder,
  settleStaleMoves,
  lapseStartedRequests,
  finishReminder,
  displayName,
  holderLabel,
  holders,
  pendingWithdrawals,
  type Room,
  type RoomBooking,
  type RoomRequest,
  type Withdrawal,
  type WithdrawReason,
} from "./roomBookingData";
import { describeRecurrence, longDateLabel, remindCutoffMs, sastToday, slotLabel, startsAtMs } from "./roomBookings";
import { pause } from "./actionItemNotify";

// The booking emails COLAB sends, wired to the portal's mailer. Nobody outside
// the booking is ever written to.
//
// 🔴 Every email a request sends goes through ONE MailQueue: a serial chain
// with the action items' pause (lib/actionItemNotify.ts) between messages, so
// a request that emails ten people never bursts at the provider. Each message
// starts as soon as it is queued and its turn comes, so nothing waits on the
// caller: a forgotten settle() cannot hang a send.

export class MailQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private sentAny = false;

  /** Queues one message; resolves to whether it went, once its turn has run. */
  add(run: () => Promise<boolean>): Promise<boolean> {
    const next = this.tail.then(async () => {
      if (this.sentAny) await pause();
      this.sentAny = true;
      return run().catch(() => false);
    });
    this.tail = next;
    return next;
  }

  /** Waits for the given notify tasks, and everything queued, to finish. */
  async settle<T extends unknown[]>(...tasks: { [K in keyof T]: Promise<T[K]> }): Promise<T> {
    const results = (await Promise.all(tasks)) as T;
    await this.tail;
    return results;
  }
}

const failures = (results: boolean[]) => results.filter((ok) => !ok).length;

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
  holder_unreachable: "we could not reach the holder by email. Please ask again",
};

/** One email per withdrawn request, to its requester, saying why. Resolves to
 *  how many failed. */
export function notifyWithdrawn(withdrawn: Withdrawal[], room: Room | null, mail: MailQueue): Promise<number> {
  const name = room?.name ?? "the room";
  return Promise.all(
    withdrawn.map((w) =>
      mail.add(() =>
        sendRoomRequestWithdrawnEmail(w.request.requesterEmail, w.request.requesterName, WHY[w.reason], {
          roomName: name,
          dateLabel: longDateLabel(w.booking.date),
          timeLabel: slotLabel(w.booking.startMinute, w.booking.endMinute),
        })
      )
    )
  ).then(failures);
}

/** Confirmation to both holders, once per booking or series. Resolves true if all went. */
export function notifyBookingCreated(first: RoomBooking, room: Room, mail: MailQueue): Promise<boolean> {
  return Promise.all(holders(first).map((h) => mail.add(() => sendBookingConfirmedEmail(h.email, h.name, facts(first, room))))).then(
    (r) => failures(r) === 0
  );
}

/** A retired room's upcoming bookings were cancelled: ONE email per holder
 *  listing their dates, then one per withdrawn request. Resolves to failures. */
export function notifyRoomRetired(cancelled: RoomBooking[], room: Room, mail: MailQueue): Promise<number> {
  const holdersMail = Promise.all(
    [...byHolder(cancelled)].map(([email, h]) => mail.add(() => sendBookingsCancelledEmail(email, h.name, room.name, "room_retired", "", h.bookings.map(line))))
  ).then(failures);
  const asked = notifyWithdrawn(cancelled.flatMap((b) => pendingWithdrawals(b, "room_retired")), room, mail);
  return Promise.all([holdersMail, asked]).then(([a, b]) => a + b);
}

/** Bookings were cancelled: ONE email to each holder other than whoever did
 *  it (Jane cancelling what she booked for Sarah tells Sarah; a room manager
 *  tells both). Resolves to failures. */
export function notifyCancelledByOther(cancelled: RoomBooking[], room: Room, by: { id: string; name: string; email: string }, mail: MailQueue): Promise<number> {
  return Promise.all(
    [...byHolder(cancelled, by.email)].map(([email, h]) => mail.add(() => sendBookingsCancelledEmail(email, h.name, room.name, "by_manager", by.name, h.bookings.map(line))))
  ).then(failures);
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
 *  holder other than the editor. Someone already getting a hand-over email for
 *  this edit is not sent this as well. Resolves to failures. */
export function notifyEdited(
  before: RoomBooking,
  after: RoomBooking,
  room: Room,
  editor: { name: string; email: string },
  holderChanged: boolean,
  mail: MailQueue
): Promise<number> {
  const changes = editChanges(before, after);
  if (changes.length === 0) return Promise.resolve(0);
  const handedOver = holderChanged ? new Set([before, after].map((b) => (b.bookedForEmail || b.bookedByEmail).toLowerCase())) : new Set<string>();
  const to = holders(after).filter((h) => !same(h.email, editor.email) && !handedOver.has(h.email.toLowerCase()));
  return Promise.all(to.map((h) => mail.add(() => sendBookingChangedEmail(h.email, h.name, editor.name, changes, facts(after, room))))).then(failures);
}

/** An edit changed who the room is for: tell both sides, except whoever made
 *  the change (they know). Resolves true if all went. */
export function notifyHandover(before: RoomBooking, after: RoomBooking, room: Room, changedBy: { name: string; email: string }, mail: MailQueue): Promise<boolean> {
  const prev = { name: before.bookedForName || before.bookedByName, email: before.bookedForEmail || before.bookedByEmail };
  const next = { name: after.bookedForName || after.bookedByName, email: after.bookedForEmail || after.bookedByEmail };
  const sends: Promise<boolean>[] = [];
  if (!same(next.email, changedBy.email)) {
    sends.push(mail.add(() => sendBookingHandedOverEmail(next.email, next.name, prev.name, changedBy.name, facts(after, room))));
  }
  if (!same(prev.email, changedBy.email) && !same(prev.email, next.email)) {
    const stillHolderAsBooker = before.bookedForEmail === null;
    sends.push(mail.add(() => sendBookingTakenOverEmail(prev.email, prev.name, next.name, changedBy.name, stillHolderAsBooker, facts(after, room))));
  }
  return Promise.all(sends).then((r) => failures(r) === 0);
}

/** The ask goes to both holders; either may answer. Resolves true if anyone got it. */
export function notifyRoomRequest(b: RoomBooking, room: Room, r: RoomRequest, mail: MailQueue): Promise<boolean> {
  const f = facts(b, room);
  return Promise.all(holders(b).map((h) => mail.add(() => sendRoomRequestEmail(h.email, h.name, r.requesterName, r.title, r.message, b.title, r.token, f)))).then(
    (res) => res.some(Boolean)
  );
}

/** Who the requester is told answered (gave them the room, or declined): the
 *  holder, or, when a room manager answered on the holder's behalf, that manager. */
export function giverName(before: RoomBooking, by?: { name: string; onBehalf: boolean }): string {
  return by?.onBehalf ? `${by.name} (a room manager)` : holderLabel(before);
}

/** The answer, to the requester. On an approve, every holder other than the
 *  one who answered is told too: their booking has gone. Resolves true if all went. */
export function notifyRequestOutcome(
  before: RoomBooking,
  after: RoomBooking,
  room: Room | null,
  r: RoomRequest,
  by: { name: string; email: string; onBehalf: boolean } | undefined,
  mail: MailQueue
): Promise<boolean> {
  const f = { roomName: room?.name ?? "the room", dateLabel: longDateLabel(before.date), timeLabel: slotLabel(before.startMinute, before.endMinute) };
  const sends = [
    mail.add(() =>
      r.status === "approved"
        ? sendRoomRequestApprovedEmail(r.requesterEmail, r.requesterName, giverName(before, by), { ...f, title: after.title })
        : sendRoomRequestDeclinedEmail(r.requesterEmail, r.requesterName, giverName(before, by), r.declineReason || "", f)
    ),
  ];
  if (r.status === "approved" && by && room) {
    for (const h of holders(before)) {
      if (same(h.email, by.email)) continue;
      sends.push(mail.add(() => sendBookingGivenAwayEmail(h.email, h.name, by.name, r.requesterName, facts(before, room))));
    }
  }
  return Promise.all(sends).then((res) => failures(res) === 0);
}

/** Lapses unanswerable requests on meetings that have started, and tells each
 *  requester. Run from the daily cron. */
export async function runRequestLapses(now: Date = new Date(), mail: MailQueue = new MailQueue()): Promise<{ lapsed: number; failed: number; detail: string[] }> {
  const groups = await lapseStartedRequests(now);
  const [counts] = await mail.settle(Promise.all(groups.map(({ withdrawn, room }) => notifyWithdrawn(withdrawn, room, mail))));
  return {
    lapsed: groups.reduce((n, g) => n + g.withdrawn.length, 0),
    failed: (counts as number[]).reduce((a, b) => a + b, 0),
    detail: groups.map(({ withdrawn, room }) => `Room ${room.name}: ${withdrawn.length} unanswered request(s) lapsed, the meeting had started`),
  };
}

/** How long a failed immediate reminder waits before its one retry. */
export const REMIND_RETRY_MS = 2_000;

/** Sends a claimed reminder to the holders not yet reached, records who it
 *  reached, and resolves to how many are still unreached. With `retry`, a
 *  failure is tried once more after REMIND_RETRY_MS. */
type ReminderSender = typeof sendBookingReminderEmail;

async function sendClaimedReminder(
  booking: RoomBooking,
  room: Room,
  stamp: string,
  now: Date,
  mail: MailQueue,
  retry: boolean,
  send: ReminderSender = sendBookingReminderEmail
): Promise<{ sent: number; unreached: number }> {
  const reached = new Set((booking.remindedEmails ?? []).map((e) => e.toLowerCase()));
  const when = booking.date === sastToday(now) ? "today" : "tomorrow";
  const sendTo = async (list: { name: string; email: string }[]) => {
    const results = await Promise.all(list.map((h) => mail.add(() => send(h.email, h.name, facts(booking, room), when))));
    list.forEach((h, i) => results[i] && reached.add(h.email.toLowerCase()));
    return results.filter(Boolean).length;
  };
  const todo = () => holders(booking).filter((h) => !reached.has(h.email.toLowerCase()));
  let sent = await sendTo(todo());
  if (retry && todo().length > 0) {
    await new Promise((r) => setTimeout(r, REMIND_RETRY_MS));
    sent += await sendTo(todo());
  }
  const unreached = todo().length;
  await finishReminder(booking, stamp, [...reached], unreached === 0);
  return { sent, unreached };
}

/** A meeting that starts before the next reminder run (plus an hour, for a
 *  late cron) might never be reminded by the cron: remind it now. A failed holder is retried once,
 *  shortly; resolves to { reminded, unreached }. */
export async function remindNowIfBeforeNextRun(
  booking: RoomBooking,
  room: Room,
  mail: MailQueue,
  now: Date = new Date(),
  /** The sender, swappable in the checks to make a send fail. */
  send: ReminderSender = sendBookingReminderEmail
): Promise<{ reminded: boolean; unreached: number }> {
  // Up to an hour after the next run: the cron can fire late (Vercel allows
  // ~30 min), so a 07:10 meeting booked at 06:50 is reminded now, not missed.
  const at = startsAtMs(booking.date, booking.startMinute);
  if (!(at > now.getTime() && at < remindCutoffMs(now))) return { reminded: false, unreached: 0 };
  const stamp = now.toISOString();
  if (!(await claimReminder(booking, stamp, null))) return { reminded: false, unreached: 0 };
  const { unreached } = await sendClaimedReminder(booking, room, stamp, now, mail, true, send);
  return { reminded: true, unreached };
}

/** Settles cross-month moves a dead request left half done. Run from the cron. */
export async function runSettleMoves(now: Date = new Date()): Promise<string[]> {
  const r = await settleStaleMoves(now);
  return r.rolledBack + r.finished ? [`Room bookings: ${r.rolledBack} half-done move(s) rolled back, ${r.finished} finished`] : [];
}

/** The reminder, run from the daily cron (see remindCutoffMs for which
 *  bookings). Claimed before sending so overlapping runs cannot double-send. */
export async function runRoomBookingReminders(now: Date = new Date(), mail: MailQueue = new MailQueue()): Promise<{ due: number; sent: number; failed: number; detail: string[] }> {
  const due = await bookingsDueForReminder(now);
  const detail: string[] = [];
  const tasks: Promise<{ sent: number; unreached: number }>[] = [];
  for (const { booking, room } of due) {
    const stamp = now.toISOString();
    // Claimed against the stamp it has now: none, or a stale one from a run that died.
    if (!(await claimReminder(booking, stamp, booking.reminderSentAt ?? null))) {
      detail.push(`Room ${room.name} "${booking.title}": already reminded by another run`);
      continue;
    }
    tasks.push(
      (async () => {
        let finished = false;
        try {
          const r = await sendClaimedReminder(booking, room, stamp, now, mail, false);
          finished = true;
          detail.push(
            `Room ${room.name} "${booking.title}" ${booking.date}: reminder sent to ${r.sent}` +
              (r.unreached ? `, ${r.unreached} not reached (tried again on the next run if the meeting has not started)` : "")
          );
          return r;
        } catch (err) {
          detail.push(`Room ${room.name} "${booking.title}" ${booking.date}: reminder failed: ${err instanceof Error ? err.message : String(err)}`);
          throw err;
        } finally {
          // A claim that never finished is handed back, so the next run tries again.
          if (!finished) await claimReminder(booking, null, stamp).catch(() => false);
        }
      })()
    );
  }
  // One booking's failure does not stop the others.
  const settled = await Promise.allSettled(tasks);
  await mail.settle();
  const ok = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
  const broken = settled.length - ok.length;
  return { due: due.length, sent: ok.reduce((n, r) => n + r.sent, 0), failed: ok.reduce((n, r) => n + r.unreached, 0) + broken, detail };
}

// --- Guest bookings from a room's public link ----------------------------------

/** Everyone whose role can manage rooms: they approve guest bookings. */
async function roomManagers(): Promise<{ name: string; email: string }[]> {
  const [users, roles] = await Promise.all([getUsers(), getRoles()]);
  return users
    .filter((u) => !u.retiredAt && !u.termLocked)
    .filter((u) => u.email && resolveRolePermissions(u.role, roles.find((r) => r.id === u.role)).includes("manage_rooms"))
    .filter((u, i, all) => all.findIndex((o) => same(o.email, u.email)) === i)
    .map((u) => ({ name: displayName(u), email: u.email }));
}

/** Every room manager is asked to approve it. The guest is NOT emailed yet:
 *  their address is unchecked and the title is theirs, so an automatic reply
 *  would let anyone send the school's email to anyone. They hear once a person
 *  has approved or declined. Resolves to how many managers were reached. */
export async function notifyGuestBooked(b: RoomBooking, room: Room, mail: MailQueue): Promise<number> {
  const g = b.guest!;
  const f = facts(b, room);
  const managers = await roomManagers();
  const sent = await Promise.all(managers.map((m) => mail.add(() => sendGuestBookingToApproveEmail(m.email, m.name, g, f))));
  return sent.filter(Boolean).length;
}

export function notifyGuestDecision(b: RoomBooking, room: Room, approved: boolean, mail: MailQueue): Promise<boolean> {
  const g = b.guest!;
  const send = approved ? sendGuestBookingApprovedEmail : sendGuestBookingDeclinedEmail;
  return mail.add(() => send(g.email, g.name, room.id, facts(b, room)));
}
