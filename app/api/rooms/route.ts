import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission, requirePermission } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { actorOf, getRooms, parseRoomInput, roomHasBookings, saveRoom } from "@/lib/roomBookingData";

// Anyone who can book sees the active rooms. Room managers also see retired
// ones; with ?withUsage=1 (the rooms admin page) each also says whether it has
// bookings on record, so Delete can warn honestly. The calendar does not ask.
export async function GET(req: NextRequest) {
  const session = await requireAnyPermission(req, ["book_rooms", "manage_rooms"]);
  if (session instanceof NextResponse) return session;
  const manage = session.permissions.includes("manage_rooms");
  const rooms = await getRooms();
  const body = !manage
    ? rooms.filter((r) => r.active)
    : req.nextUrl.searchParams.get("withUsage") === "1"
      ? await Promise.all(rooms.map(async (r) => ({ ...r, hasBookings: await roomHasBookings(r.id) })))
      : rooms;
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_rooms");
  if (session instanceof NextResponse) return session;
  const parsed = parseRoomInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const result = await saveRoom(actorOf(session), null, parsed.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const { room } = result.value;
  await recordActivity({
    ...actorFrom(req, session),
    action: "room.created",
    entity: "room",
    entityId: room.id,
    summary: `Added meeting room "${room.name}" (seats ${room.capacity})`,
  });
  return NextResponse.json(room, { status: 201 });
}
