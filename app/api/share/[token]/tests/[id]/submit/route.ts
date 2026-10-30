import { NextRequest, NextResponse } from "next/server";
import { guestContext } from "@/lib/campusGuestRoute";
import { handIn } from "@/lib/trainingLearner";
import { recordActivity } from "@/lib/activityLog";
import { ipOf } from "@/lib/rateLimit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const ctx = await guestContext(req, token);
  if (ctx instanceof NextResponse) return ctx;
  const body = await req.json().catch(() => ({}));
  const responses = body && typeof body.responses === "object" && body.responses ? (body.responses as Record<string, unknown>) : {};
  const out = await handIn(ctx.learner, id, responses);
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
  await recordActivity({
    actorName: `${ctx.guest.name} ${ctx.guest.surname} (via link)`,
    actorEmail: ctx.guest.email,
    ip: ipOf(req),
    action: "training.test.submitted.guest",
    entity: "training",
    entityId: id,
    summary: `Sat "${out.test.title}" through a share link: ${out.attempt.scorePct}% (${out.attempt.passed ? "passed" : "not passed"})`,
  });
  return NextResponse.json(out.body);
}
