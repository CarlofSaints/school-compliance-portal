import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { actorOf, holderLabel, isDate, isId, parseRequestInput, requestRoom } from "@/lib/roomBookingData";
import { longDateLabel } from "@/lib/roomBookings";
import { notifyRoomRequest } from "@/lib/roomBookingNotify";

// Ask whoever holds this booking for the room. They get an email with a link;
// nothing changes unless they agree.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(req, "book_rooms");
  if (session instanceof NextResponse) return session;
  const limited = await enforce([[LIMITS.bookingWriteUser, session.id]]);
  if (limited) return limited;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { roomId?: unknown; date?: unknown } | null;
  if (!isId(id) || !isId(body?.roomId) || !isDate(body?.date)) return NextResponse.json({ error: "That booking is no longer live" }, { status: 404 });
  const parsed = parseRequestInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await requestRoom(actorOf(session), body.roomId, body.date, id, parsed.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const { booking, room, request } = result.value;
  const delivered = await notifyRoomRequest(booking, room, request);
  await recordActivity({
    ...actorFrom(req, session),
    action: "booking.room_requested",
    entity: "room",
    entityId: id,
    summary: `Asked ${holderLabel(booking)} for ${room.name} on ${longDateLabel(booking.date)}${delivered ? "" : " (email failed)"}`,
  });
  return NextResponse.json({ ok: true, emailFailed: !delivered }, { status: 201 });
}
