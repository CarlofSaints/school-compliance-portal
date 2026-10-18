import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { LIMITS, enforce } from "@/lib/rateLimit";
import {
  actorOf,
  cancelBooking,
  holderLabel,
  isDate,
  isHolder,
  isId,
  parseBookingInput,
  updateBooking,
} from "@/lib/roomBookingData";
import { longDateLabel, slotLabel } from "@/lib/roomBookings";
import { notifyHandover } from "@/lib/roomBookingNotify";

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

  const actor = actorOf(session);
  const result = await updateBooking(actor, id, currentDate, { ...parsed.value, recurrence: { ...parsed.value.recurrence, frequency: "none" } });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const { before, after, room, holderChanged } = result.value;

  await recordActivity({
    ...actorFrom(req, session),
    action: "booking.updated",
    entity: "room",
    entityId: id,
    summary:
      `Edited "${after.title}" in ${room.name}: ${longDateLabel(after.date)} ${slotLabel(after.startMinute, after.endMinute)}` +
      (holderChanged ? `, now for ${after.bookedForName || after.bookedByName} (was ${before.bookedForName || before.bookedByName})` : ""),
    detail: { before, after },
  });

  const emailed = holderChanged ? await notifyHandover(before, after, room, actor) : true;
  return NextResponse.json({ ok: true, emailFailed: !emailed });
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
  const result = await cancelBooking(actor, roomId, date, id, scope);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const { booking, count, skipped } = result.value;
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
  return NextResponse.json({ ok: true, count, skipped });
}
