import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { actorOf, getRequestView, holderLabel, isHolder, respondToRequest } from "@/lib/roomBookingData";
import { longDateLabel, slotLabel } from "@/lib/roomBookings";
import { notifyRequestOutcome } from "@/lib/roomBookingNotify";

// Where the emailed Approve / Decline links land. 🔴 The token only NAMES the
// request. The reader must be signed in, and only a holder of the booking (or
// someone with manage_rooms) may answer; a forwarded email gives nobody else
// anything.

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  const { token } = await params;
  const result = await getRequestView(actorOf(session), token);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const { booking, request, room, canAnswer } = result.value;
  return NextResponse.json(
    {
      status: booking.status === "confirmed" || request.status !== "pending" ? request.status : "withdrawn",
      canAnswer,
      requesterName: request.requesterName,
      requesterMeeting: request.title,
      message: request.message,
      attendeeCount: request.attendeeCount,
      declineReason: request.declineReason ?? null,
      roomName: room?.name ?? "",
      date: booking.date,
      startMinute: booking.startMinute,
      endMinute: booking.endMinute,
      yourMeeting: booking.title,
      holderName: holderLabel(booking),
      // Which wording the page uses: the holder answering, the person who asked, or a room manager looking on.
      viewerRole: isHolder(booking, session.id) ? "holder" : request.requesterId === session.id ? "requester" : "manager",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  const limited = await enforce([[LIMITS.emailSendUser, session.id]]);
  if (limited) return limited;
  const { token } = await params;
  const body = (await req.json().catch(() => null)) as { decision?: unknown; reason?: unknown } | null;
  if (body?.decision !== "approve" && body?.decision !== "decline") return NextResponse.json({ error: "Choose approve or decline" }, { status: 400 });
  const reason = body.reason === undefined ? "" : body.reason;
  if (typeof reason !== "string" || reason.length > 1000) return NextResponse.json({ error: "The reason must be text, at most 1000 characters" }, { status: 400 });

  const result = await respondToRequest(actorOf(session), token, body.decision, reason);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const { before, after, request, room } = result.value;
  const emailed = await notifyRequestOutcome(before, after, room, request);
  const where = `${room?.name ?? "a room"} on ${longDateLabel(before.date)} ${slotLabel(before.startMinute, before.endMinute)}`;
  await recordActivity({
    ...actorFrom(req, session),
    action: request.status === "approved" ? "booking.request_approved" : "booking.request_declined",
    entity: "room",
    entityId: before.id,
    summary:
      request.status === "approved"
        ? `Gave ${where} to ${request.requesterName}`
        : `Declined ${request.requesterName}'s request for ${where}`,
    detail: request.status === "approved" ? { before, after } : { reason: request.declineReason },
  });
  return NextResponse.json({ ok: true, status: request.status, emailFailed: !emailed });
}
