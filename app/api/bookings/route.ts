import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission, requirePermission } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { LIMITS, enforce } from "@/lib/rateLimit";
import {
  actorOf,
  bookingView,
  bookingsBetween,
  createBooking,
  isDate,
  isId,
  parseBookingInput,
} from "@/lib/roomBookingData";
import { addDays, describeRecurrence, longDateLabel, slotLabel, weekStart } from "@/lib/roomBookings";
import { notifyBookingCreated } from "@/lib/roomBookingNotify";

// One room, one week: GET /api/bookings?room=<id>&week=<any date in the week>
export async function GET(req: NextRequest) {
  const session = await requireAnyPermission(req, ["book_rooms", "manage_rooms"]);
  if (session instanceof NextResponse) return session;
  const room = req.nextUrl.searchParams.get("room");
  const week = req.nextUrl.searchParams.get("week");
  if (!isId(room) || !isDate(week)) return NextResponse.json({ error: "Pick a room and a week" }, { status: 400 });
  const monday = weekStart(week);
  const actor = actorOf(session);
  const list = await bookingsBetween(room, monday, addDays(monday, 6));
  return NextResponse.json(list.map((b) => bookingView(b, actor)), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "book_rooms");
  if (session instanceof NextResponse) return session;
  const limited = await enforce([[LIMITS.bookingWriteUser, session.id]]);
  if (limited) return limited;

  const parsed = parseBookingInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const actor = actorOf(session);
  const result = await createBooking(actor, parsed.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const { bookings, room } = result.value;
  const first = bookings[0];
  await recordActivity({
    ...actorFrom(req, session),
    action: "booking.created",
    entity: "room",
    entityId: first.id,
    summary:
      `Booked ${room.name} for "${first.title}" on ${longDateLabel(first.date)} ${slotLabel(first.startMinute, first.endMinute)}` +
      (first.bookedForName ? ` on behalf of ${first.bookedForName}` : "") +
      (first.recurrence ? `, ${describeRecurrence(first.recurrence)} (${bookings.length} bookings)` : ""),
    detail: { roomId: room.id, seriesId: first.seriesId, dates: bookings.map((b) => b.date) },
  });

  const emailed = await notifyBookingCreated(first, room);
  return NextResponse.json(
    { count: bookings.length, emailFailed: !emailed },
    { status: 201 }
  );
}
