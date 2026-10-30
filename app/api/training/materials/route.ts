import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { MATERIAL_EXT, cleanMaterialFields, type Material } from "@/lib/training";
import { createItem, saveMaterialFile, stamp } from "@/lib/trainingData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

/** Material loaded by hand: text written here, or a document uploaded (under 4 MB, Vercel's body limit). */
export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_training");
  if (session instanceof NextResponse) return session;

  const form = await req.formData();
  const fields = cleanMaterialFields(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  const file = form.get("file");
  if (!fields.title) return NextResponse.json({ error: "Give the material a title." }, { status: 400 });

  const base = stamp(session.id);
  let upload: Material["file"];
  if (file instanceof File && file.size > 0) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!MATERIAL_EXT.includes(ext)) {
      return NextResponse.json({ error: "That type of file cannot be used as material." }, { status: 400 });
    }
    await saveMaterialFile(base.id, ext, Buffer.from(await file.arrayBuffer()));
    upload = { filename: file.name, ext, size: file.size };
  }
  if (!upload && !fields.body) {
    return NextResponse.json({ error: "Write the material or upload a document." }, { status: 400 });
  }

  const material = await createItem<Material>("material", {
    ...base,
    ...fields,
    kind: upload ? "file" : "text",
    file: upload,
  });
  await recordActivity({
    ...actorFrom(req, session),
    action: "training.material.created",
    entity: "training",
    entityId: material.id,
    summary: `Added training material "${material.title}"`,
  });
  return NextResponse.json(material, { status: 201 });
}
