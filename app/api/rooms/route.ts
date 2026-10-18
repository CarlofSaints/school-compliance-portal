import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission, requirePermission } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { actorOf, getRooms, parseRoomInput, roomHasBookings, saveRoom } from "@/lib/roomBookingData";

// Anyone who can book sees the active rooms. Room managers also see retired
// ones, and whether each has bookings on record (so Delete can warn honestly).
export async function GET(req: NextRequest) {
  const session = await requireAnyPermission(req, ["book_rooms", "manage_rooms"]);
  if (session instanceof NextResponse) return session;
  const manage = session.permissions.includes("manage_rooms");
  const rooms = await getRooms();
  const body = manage
    ? await Promise.all(rooms.map(async (r) => ({ ...r, hasBookings: await roomHasBookings(r.id) })))
    : rooms.filter((r) => r.active);
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_rooms");
  if (session instanceof NextResponse) return session;
  const parsed = parseRoomInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const result = await saveRoom(actorOf(session), null, parsed.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  await recordActivity({
    ...actorFrom(req, session),
    action: "room.created",
    entity: "room",
    entityId: result.value.id,
    summary: `Added meeting room "${result.value.name}" (seats ${result.value.capacity})`,
  });
  return NextResponse.json(result.value, { status: 201 });
}
