import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requirePermission } from "@/lib/rolesData";
import { cleanTestFields, testProblem, type Test } from "@/lib/training";
import { deleteItem, getTest, updateItem } from "@/lib/trainingData";
import { openPaper } from "@/lib/trainingLearner";
import { canManageTraining } from "@/lib/trainingAccess";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

type Ctx = { params: Promise<{ id: string }> };

// ?edit=1 (managers) gives the whole test with its memo, for the editor.
// Everyone else gets the paper WITHOUT the answers, plus their own attempts.
// A free translation still missing runs after the response, inside this limit.
export const maxDuration = 300;

export async function GET(req: NextRequest, { params }: Ctx) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const test = await getTest(id);
  if (req.nextUrl.searchParams.get("edit") === "1" && canManageTraining(session)) {
    return test ? NextResponse.json(test, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const out = await openPaper({ progressId: session.id, manager: canManageTraining(session) }, id);
  return out.ok
    ? NextResponse.json(out.body, { headers: { "Cache-Control": "no-store" } })
    : NextResponse.json({ error: out.error }, { status: out.status });
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
