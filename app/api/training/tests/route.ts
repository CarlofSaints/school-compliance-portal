import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { cleanTestFields, testProblem, type Test } from "@/lib/training";
import { createItem, stamp } from "@/lib/trainingData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

/** A test built by hand. */
export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_training");
  if (session instanceof NextResponse) return session;
  const fields = cleanTestFields(await req.json().catch(() => ({})));
  if (!fields.title) return NextResponse.json({ error: "Give the test a title." }, { status: 400 });
  const problem = fields.status === "published" ? testProblem(fields.questions) : null;
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const test = await createItem<Test>("test", { ...stamp(session.id), ...fields });
  await recordActivity({
    ...actorFrom(req, session),
    action: "training.test.created",
    entity: "training",
    entityId: test.id,
    summary: `Added training test "${test.title}"`,
  });
  return NextResponse.json(test, { status: 201 });
}
