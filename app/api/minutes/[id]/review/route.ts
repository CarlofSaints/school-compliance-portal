import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getMinutes, updateMinutes } from "@/lib/minutesData";
import {
  canReview,
  isReviewer,
  reviewProgress,
  formatPeriod,
  type MinutesReview,
} from "@/lib/minutes";
import { resolveAudience } from "@/lib/minutesRecipients";
import { getUserByEmail } from "@/lib/userData";
import {
  sendMinutesChangesRequestedEmail,
  sendMinutesReadyToSignEmail,
} from "@/lib/email";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

const SEND_GAP_MS = 600;
const pause = () => new Promise((r) => setTimeout(r, SEND_GAP_MS));

/**
 * A reviewer approves the draft, or sends it back with comments.
 *
 * 🔴 Deliberately NOT gated on manage_minutes. The Principal and the Chair are
 * the people who check minutes and neither of them necessarily administers the
 * portal; gating on the secretary's permission would lock out exactly the two
 * people the round exists for. The gate is being ON THE FROZEN REVIEWER LIST.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const record = await getMinutes(id);
  if (!record) {
    return NextResponse.json({ error: "Minutes not found" }, { status: 404 });
  }

  if (!canReview(record.status)) {
    return NextResponse.json(
      { error: "These minutes are not out for checking, so there is nothing to respond to." },
      { status: 409 }
    );
  }

  const reviewers = record.reviewers || [];
  if (!isReviewer(reviewers, session.email)) {
    return NextResponse.json(
      {
        error:
          "You were not asked to check these minutes. Ask the secretary to send them to you if you should have been.",
      },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const decision = body.decision === "approved" ? "approved" : "changes_requested";
  const comments = typeof body.comments === "string" ? body.comments.trim() : "";

  // 🔴 Sending it back with no reason gives the secretary nothing to act on,
  // and the follow-up email would say only "somebody is unhappy".
  if (decision === "changes_requested" && !comments) {
    return NextResponse.json(
      { error: "Please say what needs changing, so the secretary knows what to fix." },
      { status: 400 }
    );
  }

  const reviewerName = `${session.name} ${session.surname}`.trim();
  const review: MinutesReview = {
    at: new Date().toISOString(),
    byName: reviewerName,
    byEmail: session.email,
    decision,
    comments: comments || undefined,
    // Stamped with the draft it answers. Without this, approving draft 1 would
    // still count after the secretary rewrote it as draft 2.
    draftNumber: record.draftNumber,
  };
  const reviews = [...record.reviews, review];

  // One objection sends it back. There is no point collecting the remaining
  // approvals for a document that is already being rewritten.
  const progress = reviewProgress(reviewers, reviews, record.draftNumber);
  const status =
    decision === "changes_requested"
      ? "changes_requested"
      : progress.complete
        ? "awaiting_signatures"
        : "in_review";

  const updated = await updateMinutes(id, { reviews, status });

  const periodLabel = formatPeriod(record.period);

  if (decision === "changes_requested") {
    // Straight back to whoever wrote them. createdBy is an address, so the
    // greeting falls back to it when there is no matching user account.
    const secretary = await getUserByEmail(record.createdBy).catch(() => undefined);
    await sendMinutesChangesRequestedEmail(
      record.createdBy,
      secretary ? `${secretary.name} ${secretary.surname}`.trim() : record.createdBy,
      id,
      record.title,
      reviewerName,
      comments
    );
  } else if (progress.complete) {
    // Everyone has checked it. Out to whoever signs.
    const audience = await resolveAudience("signing");
    for (const person of [...audience.to, ...audience.cc]) {
      await sendMinutesReadyToSignEmail(person.email, person.name, id, record.title, periodLabel);
      await pause();
    }
  }

  await recordActivity({
    ...actorFrom(req, session),
    action: decision === "approved" ? "minutes.approved" : "minutes.changes_requested",
    entity: "minutes",
    entityId: id,
    summary:
      decision === "approved"
        ? `Approved draft ${record.draftNumber} of "${record.title}"${progress.complete ? ", which is now ready to sign" : ` (${progress.approved} of ${progress.total})`}`
        : `Asked for changes to draft ${record.draftNumber} of "${record.title}"`,
    detail: { draftNumber: record.draftNumber, decision, comments: comments || undefined },
  });

  return NextResponse.json({ record: updated, progress });
}
