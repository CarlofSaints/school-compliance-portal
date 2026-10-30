import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requirePermission } from "@/lib/rolesData";
import { attemptsAt, cleanTestFields, deadlineFor, paperFor, submitAttempt, testProblem, TIME_GRACE_MS, type Test } from "@/lib/training";
import { deleteItem, getProgress, getTest, recordAttempt, startSitting, updateItem } from "@/lib/trainingData";
import { canManageTraining, trainingGate } from "@/lib/trainingAccess";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

type Ctx = { params: Promise<{ id: string }> };

// ?edit=1 (managers) gives the whole test with its memo, for the editor.
// Everyone else gets the paper WITHOUT the answers, plus their own attempts.
export async function GET(req: NextRequest, { params }: Ctx) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const test = await getTest(id);
  if (req.nextUrl.searchParams.get("edit") === "1" && canManageTraining(session)) {
    return test ? NextResponse.json(test, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let progress = await getProgress(session.id);
  const blocked = await trainingGate(session, test && { kind: "test", id, status: test.status }, progress);
  if (blocked || !test) return blocked!;
  // Timed paper: a sitting left to run out is handed in blank, then the clock
  // starts (or carries on, after a reload) for this opening.
  let deadline: number | null = null;
  if (test.timeLimitMinutes) {
    const old = deadlineFor(test, progress);
    if (old !== null && Date.now() > old + TIME_GRACE_MS) {
      await recordAttempt(session.id, (p) => submitAttempt(test, p, {}, new Date().toISOString()));
      progress = await getProgress(session.id);
    }
    const left = test.maxAttempts === 0 || attemptsAt(progress, id).length < test.maxAttempts;
    if (left) {
      progress = await startSitting(session.id, id);
      deadline = deadlineFor(test, progress);
    }
  }
  const attempts = attemptsAt(progress, id).map((a) => ({
    id: a.id,
    submittedAt: a.submittedAt,
    scorePct: a.scorePct,
    passed: a.passed,
  }));
  return NextResponse.json(
    { ...paperFor(test), attempts, deadline: deadline ? new Date(deadline).toISOString() : null },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await requirePermission(req, "manage_training");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const fields = cleanTestFields(await req.json().catch(() => ({})));
  if (!fields.title) return NextResponse.json({ error: "Give the test a title." }, { status: 400 });
  const problem = fields.status === "published" ? testProblem(fields.questions) : null;
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const saved = await updateItem<Test>("test", id, () => fields);
  if (!saved) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await recordActivity({
    ...actorFrom(req, session),
    action: "training.test.updated",
    entity: "training",
    entityId: id,
    summary: `Updated training test "${saved.title}" (${saved.status}, ${saved.questions.length} questions)`,
  });
  return NextResponse.json(saved);
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await requirePermission(req, "manage_training");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const test = await getTest(id);
  if (!test || !(await deleteItem("test", id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await recordActivity({
    ...actorFrom(req, session),
    action: "training.test.deleted",
    entity: "training",
    entityId: id,
    summary: `Deleted training test "${test.title}" (its scores no longer count on the leaderboard)`,
  });
  return NextResponse.json({ ok: true });
}
