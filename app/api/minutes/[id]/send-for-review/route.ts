import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { getMinutes, updateMinutes } from "@/lib/minutesData";
import {
  canSendForReview,
  formatPeriod,
  MINUTES_STATUS_LABELS,
  type MinutesReviewer,
} from "@/lib/minutes";
import { resolveAudience } from "@/lib/minutesRecipients";
import { sendMinutesForReviewEmail } from "@/lib/email";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

const CAN_MANAGE = ["manage_minutes", "manage_users"];

// Resend accepts roughly two a second and a burst returns 429s that read like
// bad addresses. Same gap as lib/actionItemNotify.ts.
const SEND_GAP_MS = 600;
const pause = () => new Promise((r) => setTimeout(r, SEND_GAP_MS));

/**
 * Sends the current draft out for checking.
 *
 * Carl: the email "explains that this is draft 1, asks them to check it and
 * then a link in the email directs them to the doc, so they can approve or
 * decline with comments".
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAnyPermission(req, CAN_MANAGE);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const record = await getMinutes(id);
  if (!record) {
    return NextResponse.json({ error: "Minutes not found" }, { status: 404 });
  }

  if (!canSendForReview(record.status)) {
    return NextResponse.json(
      {
        error:
          record.status === "in_review"
            ? "These minutes are already out for checking. Wait for the responses, or ask a reviewer to respond."
            : `These minutes are ${MINUTES_STATUS_LABELS[record.status].toLowerCase()} and cannot be sent for checking.`,
      },
      { status: 409 }
    );
  }

  // Resolved at send time, never stored: somebody added to the tag this morning
  // should be asked this afternoon without anybody maintaining a second list.
  const audience = await resolveAudience("draft");
  if (audience.empty) {
    return NextResponse.json(
      {
        error:
          "Nobody is set up to check draft minutes. Set the tag for \"Draft, out for checking\" under Admin, Minutes Admin, and try again.",
      },
      { status: 400 }
    );
  }

  // 🔴 Frozen onto the record. Someone added to the tag AFTER this goes out
  // must not un-complete the round by appearing as a new outstanding reviewer.
  // Cc is not a reviewer: being copied in is not being asked.
  const reviewers: MinutesReviewer[] = audience.to.map((r) => ({
    name: r.name,
    email: r.email,
  }));

  const draftNumber = record.draftNumber + 1;
  const updated = await updateMinutes(id, {
    status: "in_review",
    draftNumber,
    reviewers,
  });

  const periodLabel = formatPeriod(record.period);
  const from = `${session.name} ${session.surname}`.trim();

  // One at a time. A failure is reported, not thrown: minutes that went out to
  // three of four people are still out, and rolling the status back would be a
  // worse lie than naming who did not get it.
  const failed: string[] = [];
  const everyone = [...audience.to, ...audience.cc];
  for (const person of everyone) {
    const ok = await sendMinutesForReviewEmail(
      person.email,
      person.name,
      id,
      record.title,
      periodLabel,
      draftNumber,
      from
    );
    if (!ok) failed.push(person.email);
    await pause();
  }

  await recordActivity({
    ...actorFrom(req, session),
    action: "minutes.sent_for_review",
    entity: "minutes",
    entityId: id,
    summary: `Sent draft ${draftNumber} of "${record.title}" for checking to ${audience.to
      .map((r) => r.name)
      .join(", ")}`,
    detail: {
      draftNumber,
      to: audience.to.map((r) => r.email),
      cc: audience.cc.map((r) => r.email),
      failed,
      withoutEmail: audience.withoutEmail,
    },
  });

  return NextResponse.json({
    record: updated,
    sent: everyone.length - failed.length,
    failed,
    // Named, never silently dropped: somebody meant to check the minutes who
    // has no address is a gap the secretary has to see.
    withoutEmail: audience.withoutEmail,
  });
}
