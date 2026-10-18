import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { actorOf, deleteRoom, getRoom, isId, parseRoomInput, saveRoom } from "@/lib/roomBookingData";

// Edit a room, or retire / bring back one (send `active`).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(req, "manage_rooms");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  const body = await req.json().catch(() => null);
  const parsed = parseRoomInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const active = (body as { active?: unknown })?.active;
  if (active !== undefined && typeof active !== "boolean") return NextResponse.json({ error: "Invalid active flag" }, { status: 400 });

  const before = await getRoom(id);
  const result = await saveRoom(actorOf(session), id, { ...parsed.value, active });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const r = result.value;
  const verb = before && before.active !== r.active ? (r.active ? "Brought back" : "Retired") : "Updated";
  await recordActivity({
    ...actorFrom(req, session),
    action: verb === "Updated" ? "room.updated" : r.active ? "room.reactivated" : "room.retired",
    entity: "room",
    entityId: r.id,
    summary: `${verb} meeting room "${r.name}" (seats ${r.capacity})`,
    detail: before ? { before, after: r } : undefined,
  });
  return NextResponse.json(r);
}

// Deletes a room nobody has ever booked. One with bookings on record is
// retired instead, so the calendar history is never erased.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(req, "manage_rooms");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  const result = await deleteRoom(actorOf(session), id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const { room, retired } = result.value;
  await recordActivity({
    ...actorFrom(req, session),
    action: retired ? "room.retired" : "room.deleted",
    entity: "room",
    entityId: room.id,
    summary: retired
      ? `Retired meeting room "${room.name}" (bookings on record, so not deleted)`
      : `Deleted meeting room "${room.name}" (never booked)`,
  });
  return NextResponse.json({ retired, notice: result.notice });
}
