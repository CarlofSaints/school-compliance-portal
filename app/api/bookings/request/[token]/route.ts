import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { actorOf, getRequestView, getRoom as getRequestRoom, holderLabel, logSafeBooking, respondToRequest } from "@/lib/roomBookingData";
import { longDateLabel, slotLabel } from "@/lib/roomBookings";
import { MailQueue, notifyRequestOutcome, notifyWithdrawn, remindNowIfBeforeNextRun } from "@/lib/roomBookingNotify";

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
  const { booking, request, room, canAnswer, started, viewerRole } = result.value;
  return NextResponse.json(
    {
      status: booking.status === "confirmed" || request.status !== "pending" ? request.status : "withdrawn",
      canAnswer,
      started,
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
      // Who held it when asked, so the outcome reads right after a hand-over.
      holderName: request.holderName ?? holderLabel(booking),
      // Which wording the page uses: the holder, the person who asked, or a room manager looking on.
      viewerRole,
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

  const actor = actorOf(session);
  const result = await respondToRequest(actor, token, body.decision, reason);
  if (!result.ok) {
    // A late approve lapses the request: its requester is still told.
    if (result.withdrawn?.length) {
      const mail = new MailQueue();
      await mail.settle(notifyWithdrawn(result.withdrawn, await getRequestRoom(result.withdrawn[0].booking.roomId), mail));
    }
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { before, after, request, room, onBehalf, withdrawn } = result.value;
  // One paced queue: the answer, the old holders, the other requesters, and
  // the new holder's reminder if it is due before the next run.
  const mail = new MailQueue();
  const [emailed, othersFailed] = await mail.settle(
    notifyRequestOutcome(before, after, room, request, { name: actor.name, email: actor.email, onBehalf }, mail),
    notifyWithdrawn(withdrawn, room, mail),
    request.status === "approved" && room ? remindNowIfBeforeNextRun(after, room, mail).catch(() => ({ reminded: false, unreached: 1 })) : Promise.resolve({ reminded: false, unreached: 0 })
  );
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
    // Safe fields only: no request message, decline reason or email address.
    detail: request.status === "approved" ? { before: logSafeBooking(before), after: logSafeBooking(after) } : { booking: logSafeBooking(before) },
  });
  return NextResponse.json({ ok: true, status: request.status, emailFailed: !emailed || othersFailed > 0 });
}
