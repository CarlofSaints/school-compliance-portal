import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requirePermission } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { actorOf } from "@/lib/roomBookingData";
import { longDateLabel, slotLabel } from "@/lib/roomBookings";
import { meetingIcs, parseMeetingInput } from "@/lib/meetings";
import { cancelMeeting, editMeeting, emailMeeting, everyoneToTell, getMeeting, meetingInvitees, remindMeetingNow } from "@/lib/meetingData";
import { meetingOrganizer } from "@/lib/email";

export const dynamic = "force-dynamic";
// Invites go out paced, one person after another.
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/** The calendar file, for "Add to my calendar": invitees and managers only. */
export async function GET(req: NextRequest, { params }: Ctx) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  const m = await getMeeting((await params).id);
  if (!m) return NextResponse.json({ error: "That meeting no longer exists" }, { status: 404 });
  if (!session.permissions.includes("manage_meetings") && m.createdById !== session.id) {
    const invited = (await meetingInvitees(m)).some((i) => i.userId === session.id || i.email.toLowerCase() === session.email.toLowerCase());
    if (!invited) return NextResponse.json({ error: "That meeting no longer exists" }, { status: 404 });
  }
  const org = await meetingOrganizer();
  const ics = meetingIcs(m, { method: m.status === "cancelled" ? "CANCEL" : "REQUEST", organizerEmail: org.email, organizerName: org.name, link: `${org.site}/meetings` });
  return new NextResponse(ics, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="meeting.ics"', "Cache-Control": "no-store" },
  });
}

/** Edit: everyone invited (before or after) is emailed the new details. */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await requirePermission(req, "manage_meetings");
  if (session instanceof NextResponse) return session;
  const limited = await enforce([[LIMITS.emailSendUser, session.id]]);
  if (limited) return limited;
  const parsed = parseMeetingInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const r = await editMeeting(actorOf(session), (await params).id, parsed.value);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const { after, invitees, dropped, roomReleased, quiet } = r.value;
  await recordActivity({
    ...actorFrom(req, session),
    action: "meeting.changed",
    entity: "meeting",
    entityId: after.id,
    summary: `Changed "${after.title}" (${longDateLabel(after.date)} ${slotLabel(after.startMinute, after.endMinute)})`,
  });
  if (quiet) return NextResponse.json({ meeting: after, roomReleased, quiet, sent: 0, failed: 0 });
  // Someone taken off the list is told it is cancelled for them.
  const a = await emailMeeting(after, "changed", invitees);
  const b = dropped.length ? await emailMeeting({ ...after, status: "cancelled" }, "cancelled", dropped) : { sent: 0, failed: 0 };
  return NextResponse.json({ meeting: after, roomReleased, sent: a.sent + b.sent, failed: a.failed + b.failed });
}

/** Cancel: kept as the record, everyone emailed, the room let go. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await requirePermission(req, "manage_meetings");
  if (session instanceof NextResponse) return session;
  const limited = await enforce([[LIMITS.emailSendUser, session.id]]);
  if (limited) return limited;
  const r = await cancelMeeting(actorOf(session), (await params).id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const { meeting, roomReleased } = r.value;
  await recordActivity({
    ...actorFrom(req, session),
    action: "meeting.cancelled",
    entity: "meeting",
    entityId: meeting.id,
    summary: `Cancelled "${meeting.title}" on ${longDateLabel(meeting.date)}`,
  });
  // Everyone who has it in their calendar, including anyone since taken off a tag.
  const mail = await emailMeeting(meeting, "cancelled", everyoneToTell(meeting, await meetingInvitees(meeting)));
  return NextResponse.json({ ok: true, roomReleased, ...mail });
}

/** { action: "remind" }: the reminder, to everyone invited, now. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await requirePermission(req, "manage_meetings");
  if (session instanceof NextResponse) return session;
  const limited = await enforce([[LIMITS.emailSendUser, session.id]]);
  if (limited) return limited;
  const body = await req.json().catch(() => ({}));
  if (body?.action !== "remind") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  const r = await remindMeetingNow((await params).id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  await recordActivity({ ...actorFrom(req, session), action: "meeting.reminded", entity: "meeting", entityId: (await params).id, summary: `Sent a reminder to ${r.value.sent} people` });
  return NextResponse.json(r.value);
}
