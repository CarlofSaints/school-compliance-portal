import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { actorOf, approveGuestBooking, cancelBooking, findBooking, getRoom, isDate, isId } from "@/lib/roomBookingData";
import { longDateLabel, slotLabel } from "@/lib/roomBookings";
import { MailQueue, notifyGuestDecision } from "@/lib/roomBookingNotify";

// A room manager approves or declines a booking made from the public link.
// Declining cancels it (the slot is free again); either way the guest is emailed.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(req, "manage_rooms");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { roomId?: unknown; date?: unknown; approve?: unknown };
  if (!isId(id) || !isId(body.roomId) || !isDate(body.date) || typeof body.approve !== "boolean")
    return NextResponse.json({ error: "That booking no longer exists" }, { status: 400 });
  const actor = actorOf(session);
  const room = await getRoom(body.roomId);
  if (!room) return NextResponse.json({ error: "That room isn't available" }, { status: 404 });

  let booking;
  if (body.approve) {
    const r = await approveGuestBooking(actor, body.roomId, body.date, id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    booking = r.value;
  } else {
    // Only a booking still waiting: this route never cancels an approved one.
    const waiting = await findBooking(body.roomId, body.date, id);
    if (!waiting?.pendingApproval || waiting.status !== "confirmed")
      return NextResponse.json({ error: "That booking is no longer waiting for approval" }, { status: 404 });
    const r = await cancelBooking(actor, body.roomId, body.date, id, "one");
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    booking = r.value.booking;
  }
  await recordActivity({
    ...actorFrom(req, session),
    action: body.approve ? "booking.guest_approved" : "booking.guest_declined",
    entity: "room",
    entityId: id,
    summary: `${body.approve ? "Approved" : "Declined"} ${booking.guest?.name ?? "a guest"}'s booking of ${room.name} on ${longDateLabel(booking.date)} ${slotLabel(booking.startMinute, booking.endMinute)}`,
    detail: { roomId: room.id },
  });
  const mail = new MailQueue();
  const [emailed] = booking.guest ? await mail.settle(notifyGuestDecision(booking, room, body.approve, mail)) : [true];
  return NextResponse.json({ ok: true, emailFailed: !emailed });
}
