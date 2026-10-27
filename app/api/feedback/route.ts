import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getUserById } from "@/lib/userData";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { recordActivity } from "@/lib/activityLog";
import { parseFeedback, saveFeedback, KIND_LABELS } from "@/lib/feedback";
import { isEmailConfigured, sendFeedbackEmail, sendFeedbackConfirmationEmail } from "@/lib/email";

// { kind, summary, detail, page } -> a ticket. Any signed-in user.
export async function POST(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const parsed = parseFeedback(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const limited = await enforce([[LIMITS.feedbackUser, session.id]]);
  if (limited) return limited;
  if (!isEmailConfigured()) {
    return NextResponse.json({ error: "Reports cannot be sent just now. Please email help@schoolcompliance.co.za." }, { status: 503 });
  }

  const user = await getUserById(session.id);
  const from = {
    id: session.id,
    name: user ? `${user.name} ${user.surname}`.trim() : session.email,
    email: user?.email || session.email,
  };
  const fb = await saveFeedback({ ...parsed, from });
  const sent = await sendFeedbackEmail(fb, fb.page ? `${req.nextUrl.origin}${fb.page}` : "").catch(() => false);
  // Nobody reads the saved copy, so an unsent report must not look sent.
  if (!sent) {
    console.error("[feedback] email to School Compliance failed", fb.ticket);
    return NextResponse.json({ error: "Your report could not be sent just now. Please try again in a moment." }, { status: 502 });
  }
  await sendFeedbackConfirmationEmail(fb).catch(() => false);

  await recordActivity({
    actorName: from.name,
    actorEmail: from.email,
    action: `feedback.${fb.kind}`,
    entity: "system",
    summary: `${KIND_LABELS[fb.kind]} ${fb.ticket}: ${fb.summary}`,
    detail: { ticket: fb.ticket, page: fb.page },
  });

  return NextResponse.json({ ok: true, ticket: fb.ticket });
}
