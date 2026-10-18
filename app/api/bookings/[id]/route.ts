import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { LIMITS, enforce } from "@/lib/rateLimit";
import {
  actorOf,
  cancelBooking,
  getRoom,
  holderLabel,
  isDate,
  isHolder,
  isId,
  logSafeBooking,
  parseBookingInput,
  updateBooking,
} from "@/lib/roomBookingData";
import { longDateLabel, slotLabel } from "@/lib/roomBookings";
import { MailQueue, notifyCancelledByOther, notifyEdited, notifyHandover, notifyWithdrawn, remindNowIfBeforeNextRun } from "@/lib/roomBookingNotify";

// A series cancel can email many people, paced.
export const maxDuration = 300;

// `currentDate` and `roomId` only say WHERE the booking is stored. Whether the
// caller may touch it is decided from the stored record: a holder, or
// manage_rooms. Both the holder check and the permission are server-side.

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAnyPermission(req, ["book_rooms", "manage_rooms"]);
  if (session instanceof NextResponse) return session;
  const limited = await enforce([[LIMITS.bookingWriteUser, session.id]]);
  if (limited) return limited;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const currentDate = (body as { currentDate?: unknown })?.currentDate;
  if (!isId(id) || !isDate(currentDate)) return NextResponse.json({ error: "That booking no longer exists" }, { status: 404 });
  const parsed = parseBookingInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // updateBooking says, before writing, whether this edit will send email (a
  // new holder, or a move that withdraws pending requests); if so it also
  // counts against the email limit, like /request.
  let mailLimited: NextResponse | null = null;
  const actor = actorOf(session);
  const result = await updateBooking(
    actor,
    id,
    currentDate,
    { ...parsed.value, recurrence: { ...parsed.value.recurrence, frequency: "none" } },
    new Date(),
    async (willEmail) => {
      if (willEmail) mailLimited = await enforce([[LIMITS.emailSendUser, session.id]]);
      return !mailLimited;
    }
  );
  if (mailLimited) return mailLimited;
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const { before, after, room, holderChanged, withdrawn } = result.value;

  await recordActivity({
    ...actorFrom(req, session),
    action: "booking.updated",
    entity: "room",
    entityId: id,
    summary:
      `Edited "${after.title}" in ${room.name}: ${longDateLabel(after.date)} ${slotLabel(after.startMinute, after.endMinute)}` +
      (holderChanged ? `, now for ${after.bookedForName || after.bookedByName} (was ${before.bookedForName || before.bookedByName})` : ""),
    detail: { before: logSafeBooking(before), after: logSafeBooking(after) },
  });

  // Everything this edit emails goes out through one paced queue: the hand-over,
  // what changed (to the other holders, not the editor), the requesters of the
  // old slot, and the reminder if it is now due before the next run.
  const mail = new MailQueue();
  const remind = holderChanged || before.date !== after.date || before.startMinute !== after.startMinute;
  const [emailed, changeFailed, lapsedFailed, reminder] = await mail.settle(
    holderChanged ? notifyHandover(before, after, room, actor, mail) : Promise.resolve(true),
    notifyEdited(before, after, room, actor, holderChanged, mail),
    notifyWithdrawn(withdrawn, room, mail),
    remind ? remindNowIfBeforeNextRun(after, room, mail).catch(() => ({ reminded: false, unreached: 1 })) : Promise.resolve({ reminded: false, unreached: 0 })
  );
  return NextResponse.json({ ok: true, emailFailed: !emailed || changeFailed > 0 || lapsedFailed > 0 || reminder.unreached > 0 });
}

// DELETE /api/bookings/<id>?room=<roomId>&date=<its date>&scope=one|series
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAnyPermission(req, ["book_rooms", "manage_rooms"]);
  if (session instanceof NextResponse) return session;
  const limited = await enforce([[LIMITS.bookingWriteUser, session.id]]);
  if (limited) return limited;
  const { id } = await params;
  const sp = req.nextUrl.searchParams;
  const roomId = sp.get("room");
  const date = sp.get("date");
  const scope = sp.get("scope") ?? "one";
  if (!isId(id) || !isId(roomId) || !isDate(date)) return NextResponse.json({ error: "That booking no longer exists" }, { status: 404 });
  if (scope !== "one" && scope !== "series") return NextResponse.json({ error: "Invalid scope" }, { status: 400 });

  const actor = actorOf(session);
  // cancelBooking says, before writing, whether this cancel will email (a
  // series, someone else's booking, or waiting requesters).
  let cancelLimited: NextResponse | null = null;
  const result = await cancelBooking(actor, roomId, date, id, scope, new Date(), async (willEmail) => {
    if (willEmail) cancelLimited = await enforce([[LIMITS.emailSendUser, session.id]]);
    return !cancelLimited;
  });
  if (cancelLimited) return cancelLimited;
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const { booking, count, skipped, cancelled, withdrawn } = result.value;
  await recordActivity({
    ...actorFrom(req, session),
    action: scope === "series" ? "booking.series_cancelled" : "booking.cancelled",
    entity: "room",
    entityId: id,
    summary:
      `Cancelled ${scope === "series" ? `${count} booking${count === 1 ? "" : "s"} in the series ` : ""}"${booking.title}" from ${longDateLabel(booking.date)}` +
      (skipped ? ` (${skipped} held by someone else left alone)` : "") +
      (isHolder(booking, actor.id) ? "" : ` (held by ${holderLabel(booking)})`),
  });
  // A room manager cancelling someone else's booking tells its holders (the
  // person it was for included), and every requester waiting on it is told.
  const room = await getRoom(roomId);
  const mail = new MailQueue();
  const [a, b] = await mail.settle(room ? notifyCancelledByOther(cancelled, room, actor, mail) : Promise.resolve(0), notifyWithdrawn(withdrawn, room, mail));
  return NextResponse.json({ ok: true, count, skipped, emailFailed: a + b > 0 });
}
