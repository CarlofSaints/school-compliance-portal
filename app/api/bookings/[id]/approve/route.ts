import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { actorOf, approveGuestBooking, declineGuestBooking, getRoom, isDate, isId, type RoomBooking, type Withdrawal } from "@/lib/roomBookingData";
import { longDateLabel, slotLabel } from "@/lib/roomBookings";
import { MailQueue, notifyGuestDecision, notifyWithdrawn } from "@/lib/roomBookingNotify";

// A room manager approves or declines a booking made from the public link.
// Declining cancels it (the slot is free again); either way the guest is emailed.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(req, "manage_rooms");
  if (session instanceof NextResponse) return session;
  // Each call emails the guest: the same limits as every other booking write.
  const limited = await enforce([[LIMITS.bookingWriteUser, session.id], [LIMITS.emailSendUser, session.id]]);
  if (limited) return limited;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { roomId?: unknown; date?: unknown; approve?: unknown };
  if (!isId(id) || !isId(body.roomId) || !isDate(body.date) || typeof body.approve !== "boolean")
    return NextResponse.json({ error: "That booking no longer exists" }, { status: 400 });
  const actor = actorOf(session);
  const room = await getRoom(body.roomId);
  if (!room) return NextResponse.json({ error: "That room isn't available" }, { status: 404 });

  let booking: RoomBooking;
  let withdrawn: Withdrawal[] = [];
  if (body.approve) {
    const r = await approveGuestBooking(actor, body.roomId, body.date, id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    booking = r.value;
  } else {
    const r = await declineGuestBooking(actor, body.roomId, body.date, id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    ({ booking, withdrawn } = r.value);
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
  // Staff who asked for the slot are told their request is withdrawn, as on any cancel.
  const [emailed] = await mail.settle(
    booking.guest ? notifyGuestDecision(booking, room, body.approve, mail) : Promise.resolve(true),
    notifyWithdrawn(withdrawn, room, mail)
  );
  return NextResponse.json({ ok: true, emailFailed: !emailed });
}
