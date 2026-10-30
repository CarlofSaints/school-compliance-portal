import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { cleanModuleFields, testProblem, type Material, type Test, type TrainingModule } from "@/lib/training";
import { deleteItem, getMaterials, getModule, getTests, updateItem } from "@/lib/trainingData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

type Ctx = { params: Promise<{ id: string }> };

// The editor's copy. Learners read modules through GET /api/training.
export async function GET(req: NextRequest, { params }: Ctx) {
  const session = await requirePermission(req, "manage_training");
  if (session instanceof NextResponse) return session;
  const mod = await getModule((await params).id);
  return mod ? NextResponse.json(mod, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await requirePermission(req, "manage_training");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const fields = cleanModuleFields(await req.json().catch(() => ({})));
  if (!fields.title) return NextResponse.json({ error: "Give the module a title." }, { status: 400 });

  // Publishing a module publishes its draft pieces with it (Campus rule), or
  // people land in a module with steps missing. A test that is not ready
  // stops the whole publish instead.
  if (fields.status === "published") {
    const [materials, tests] = await Promise.all([getMaterials(), getTests()]);
    for (const item of fields.items) {
      if (item.kind !== "test") continue;
      const t = tests.find((x) => x.id === item.id);
      const problem = t && t.status !== "published" ? testProblem(t.questions) : null;
      if (problem) return NextResponse.json({ error: `"${t!.title}": ${problem}` }, { status: 400 });
    }
    for (const item of fields.items) {
      const draft = (item.kind === "material" ? materials : tests).find((x: Material | Test) => x.id === item.id && x.status !== "published");
      if (draft) await updateItem<Material | Test>(item.kind, item.id, () => ({ status: "published" }));
    }
  }

  const saved = await updateItem<TrainingModule>("module", id, () => fields);
  if (!saved) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await recordActivity({
    ...actorFrom(req, session),
    action: "training.module.updated",
    entity: "training",
    entityId: id,
    summary: `Updated training module "${saved.title}" (${saved.status}, ${saved.items.length} steps)`,
  });
  return NextResponse.json(saved);
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await requirePermission(req, "manage_training");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const mod = await getModule(id);
  if (!mod || !(await deleteItem("module", id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await recordActivity({
    ...actorFrom(req, session),
    action: "training.module.deleted",
    entity: "training",
    entityId: id,
    summary: `Deleted training module "${mod.title}" (its material and tests are kept)`,
  });
  return NextResponse.json({ ok: true });
}
