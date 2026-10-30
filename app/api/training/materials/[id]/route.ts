import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requirePermission } from "@/lib/rolesData";
import { MATERIAL_EXT, cleanMaterialFields, readingMinutes, type Material } from "@/lib/training";
import {
  deleteItem,
  getMaterial,
  getProgress,
  markOpened,
  removeMaterialFile,
  saveMaterialFile,
  updateItem,
} from "@/lib/trainingData";
import { canManageTraining } from "@/lib/trainingAccess";
import { openMaterial } from "@/lib/trainingLearner";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

type Ctx = { params: Promise<{ id: string }> };

// Opening material counts as having read it (the first time is recorded), the
// same rule Campus uses, so a module's next step unlocks.
export async function GET(req: NextRequest, { params }: Ctx) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const out = await openMaterial({ progressId: session.id, manager: canManageTraining(session) }, id, req.nextUrl.searchParams.get("edit") !== "1");
  return out.ok
    ? NextResponse.json(out.body, { headers: { "Cache-Control": "no-store" } })
    : NextResponse.json({ error: out.error }, { status: out.status });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await requirePermission(req, "manage_training");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const current = await getMaterial(id);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const fields = cleanMaterialFields(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  if (!fields.title) return NextResponse.json({ error: "Give the material a title." }, { status: 400 });
  const file = form.get("file");
  let upload = current.file;
  if (file instanceof File && file.size > 0) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!MATERIAL_EXT.includes(ext)) {
      return NextResponse.json({ error: "That type of file cannot be used as material." }, { status: 400 });
    }
    await saveMaterialFile(id, ext, Buffer.from(await file.arrayBuffer()));
    if (current.file && current.file.ext !== ext) await removeMaterialFile(id, current.file.ext).catch(() => {});
    upload = { filename: file.name, ext, size: file.size };
  }
  if (!upload && !fields.body) {
    return NextResponse.json({ error: "Write the material or upload a document." }, { status: 400 });
  }

  const saved = await updateItem<Material>("material", id, () => ({ ...fields, kind: upload ? "file" : "text", file: upload }));
  if (!saved) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await recordActivity({
    ...actorFrom(req, session),
    action: "training.material.updated",
    entity: "training",
    entityId: id,
    summary: `Updated training material "${saved.title}" (${saved.status})`,
  });
  return NextResponse.json(saved);
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await requirePermission(req, "manage_training");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const material = await getMaterial(id);
  if (!material || !(await deleteItem("material", id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await recordActivity({
    ...actorFrom(req, session),
    action: "training.material.deleted",
    entity: "training",
    entityId: id,
    summary: `Deleted training material "${material.title}"`,
  });
  return NextResponse.json({ ok: true });
}
