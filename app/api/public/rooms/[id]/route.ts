import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activityLog";
import { LIMITS, enforce, ipOf } from "@/lib/rateLimit";
import { createBooking, getRoom, isDate, isId, parseGuestBooking, takenSlots } from "@/lib/roomBookingData";
import { addDays, longDateLabel, slotLabel, weekStart } from "@/lib/roomBookings";
import { MailQueue, notifyGuestBooked } from "@/lib/roomBookingNotify";

// A room's PUBLIC link: no sign-in. GET shows only when the room is taken (no
// names, no titles); POST books it for a guest, held until a room manager
// approves. The room id is the only key, so a retired room has no page.

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const limited = await enforce([[LIMITS.guestCalendarIp, ipOf(req)]]);
  if (limited) return limited;
  const { id } = await params;
  const week = req.nextUrl.searchParams.get("week");
  if (!isId(id) || !isDate(week)) return NextResponse.json({ error: "That room isn't available" }, { status: 404 });
  const room = await getRoom(id);
  if (!room || !room.active) return NextResponse.json({ error: "That room isn't available" }, { status: 404 });
  const monday = weekStart(week);
  return NextResponse.json(
    { room: { id: room.id, name: room.name, capacity: room.capacity, notes: room.notes }, taken: await takenSlots(room.id, monday, addDays(monday, 6)) },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const limited = await enforce([[LIMITS.guestBookingIp, ipOf(req)]]);
  if (limited) return limited;
  const { id } = await params;
  const parsed = parseGuestBooking({ ...(await req.json().catch(() => ({}))), roomId: id });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { input, guest } = parsed.value;

  // The guest is the holder, under an id no user can ever have.
  const actor = { id: `guest:${crypto.randomUUID()}`, name: guest.name, email: guest.email, permissions: ["book_rooms"] };
  const result = await createBooking(actor, input, new Date(), { guest, pendingApproval: true });
  if (!result.ok) {
    // A clash names whoever holds the slot: a guest only learns it is taken.
    const error = result.status === 409 ? "Sorry, that time is already taken. Please pick another." : result.error;
    return NextResponse.json({ error }, { status: result.status });
  }
  const { bookings, room } = result.value;
  const b = bookings[0];
  await recordActivity({
    actorId: actor.id,
    actorName: `${guest.name} (public link)`,
    action: "booking.guest_requested",
    entity: "room",
    entityId: b.id,
    summary: `${guest.name}${guest.organisation ? ` (${guest.organisation})` : ""} asked for ${room.name}, "${b.title}" on ${longDateLabel(b.date)} ${slotLabel(b.startMinute, b.endMinute)}`,
    detail: { roomId: room.id },
  });
  const mail = new MailQueue();
  const [managers] = await mail.settle(notifyGuestBooked(b, room, mail).catch(() => 0));
  if (managers === 0) console.error("[rooms] guest booking: no room manager could be emailed", b.id);
  return NextResponse.json({ ok: true }, { status: 201 });
}
