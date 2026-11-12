import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requirePermission } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { actorOf, getRooms } from "@/lib/roomBookingData";
import { longDateLabel, slotLabel, sastToday } from "@/lib/roomBookings";
import { addDays } from "@/lib/actionItems";
import { parseMeetingInput } from "@/lib/meetings";
import { createMeeting, emailMeeting, getMeetings, inviteOptions, loadDirectory, meetingInvitees } from "@/lib/meetingData";
import { getTags } from "@/lib/tagData";
import { getMeetingTypes } from "@/lib/meetingTypesData";

export const dynamic = "force-dynamic";
// Invites go out paced, one person after another.
export const maxDuration = 300;

/** Meetings from 60 days back. Everyone sees the ones they are invited to;
 *  manage_meetings sees all, plus what the schedule form needs. */
export async function GET(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  const manager = session.permissions.includes("manage_meetings");
  const from = addDays(sastToday(), -60);
  const all = (await getMeetings()).filter((m) => m.date >= from);
  const dir = await loadDirectory();
  const rows = [];
  for (const m of all) {
    const invitees = await meetingInvitees(m, dir);
    const mine = invitees.some((i) => i.userId === session.id || i.email.toLowerCase() === session.email.toLowerCase());
    if (!manager && !mine && m.createdById !== session.id) continue;
    rows.push({ ...m, invitees: manager ? invitees.map((i) => ({ name: i.name, email: i.email })) : invitees.map((i) => ({ name: i.name })) });
  }
  rows.sort((a, b) => (a.date + String(a.startMinute).padStart(4, "0")).localeCompare(b.date + String(b.startMinute).padStart(4, "0")));
  // Everyone needs the type names to read the list.
  if (!manager) return NextResponse.json({ meetings: rows, types: await getMeetingTypes() }, { headers: { "Cache-Control": "no-store" } });
  const [tags, people, types, rooms] = await Promise.all([getTags(), inviteOptions(), getMeetingTypes(), getRooms()]);
  return NextResponse.json(
    {
      meetings: rows,
      tags: tags.map((t) => ({ id: t.id, name: t.name })),
      people,
      types,
      // Only someone who may book rooms is offered them.
      rooms: session.permissions.includes("book_rooms") ? rooms.filter((r) => r.active).map((r) => ({ id: r.id, name: r.name, capacity: r.capacity })) : [],
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_meetings");
  if (session instanceof NextResponse) return session;
  const limited = await enforce([[LIMITS.emailSendUser, session.id]]);
  if (limited) return limited;
  const parsed = parseMeetingInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const r = await createMeeting(actorOf(session), parsed.value);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const { meeting: m, invitees } = r.value;
  await recordActivity({
    ...actorFrom(req, session),
    action: "meeting.scheduled",
    entity: "meeting",
    entityId: m.id,
    summary: `Scheduled "${m.title}" on ${longDateLabel(m.date)} ${slotLabel(m.startMinute, m.endMinute)}${m.room ? ` in ${m.room.roomName}` : ""}`,
  });
  const mail = await emailMeeting(m, "invite", invitees);
  return NextResponse.json({ meeting: m, ...mail }, { status: 201 });
}
