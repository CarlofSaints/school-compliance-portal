import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { canManageTraining } from "@/lib/trainingAccess";
import { handIn } from "@/lib/trainingLearner";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

// Hands in a paper (lib/trainingLearner.ts does the marking and the memo rule).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const responses = body && typeof body.responses === "object" && body.responses ? (body.responses as Record<string, unknown>) : {};
  const out = await handIn({ progressId: session.id, manager: canManageTraining(session) }, id, responses);
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
  await recordActivity({
    ...actorFrom(req, session),
    action: "training.test.submitted",
    entity: "training",
    entityId: id,
    summary: `Sat "${out.test.title}": ${out.attempt.scorePct}% (${out.attempt.passed ? "passed" : "not passed"})`,
  });
  return NextResponse.json(out.body);
}
