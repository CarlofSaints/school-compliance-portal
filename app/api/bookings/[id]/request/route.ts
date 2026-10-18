import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { actorOf, holderLabel, isDate, isId, parseRequestInput, requestRoom, withdrawRequest } from "@/lib/roomBookingData";
import { longDateLabel } from "@/lib/roomBookings";
import { MailQueue, notifyRoomRequest } from "@/lib/roomBookingNotify";

// Ask whoever holds this booking for the room. They get an email with a link;
// nothing changes unless they agree.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(req, "book_rooms");
  if (session instanceof NextResponse) return session;
  // A booking write that also sends email: both limits apply.
  const limited = await enforce([
    [LIMITS.bookingWriteUser, session.id],
    [LIMITS.emailSendUser, session.id],
  ]);
  if (limited) return limited;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { roomId?: unknown; date?: unknown } | null;
  if (!isId(id) || !isId(body?.roomId) || !isDate(body?.date)) return NextResponse.json({ error: "That booking is no longer live" }, { status: 404 });
  const parsed = parseRequestInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await requestRoom(actorOf(session), body.roomId, body.date, id, parsed.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const { booking, room, request } = result.value;
  const mail = new MailQueue();
  const [delivered] = await mail.settle(notifyRoomRequest(booking, room, request, mail));
  if (!delivered) {
    // No holder could be told, so nobody can answer: withdraw it (freeing the
    // series) and ask the requester to try again, rather than leave it hanging.
    await withdrawRequest(request.token, "holder_unreachable");
    await recordActivity({
      ...actorFrom(req, session),
      action: "booking.room_request_failed",
      entity: "room",
      entityId: id,
      summary: `Asked ${holderLabel(booking)} for ${room.name} on ${longDateLabel(booking.date)}, but no email reached them, so the request was withdrawn`,
    });
    return NextResponse.json({ error: "We couldn't email the holder, so your request was withdrawn. Please try again." }, { status: 502 });
  }
  await recordActivity({
    ...actorFrom(req, session),
    action: "booking.room_requested",
    entity: "room",
    entityId: id,
    summary: `Asked ${holderLabel(booking)} for ${room.name} on ${longDateLabel(booking.date)}`,
  });
  return NextResponse.json({ ok: true, emailFailed: false }, { status: 201 });
}
