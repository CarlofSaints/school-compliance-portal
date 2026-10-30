import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { cleanModuleFields, type TrainingModule } from "@/lib/training";
import { createItem, stamp } from "@/lib/trainingData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

/** A module put together by hand from existing material and tests. */
export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_training");
  if (session instanceof NextResponse) return session;
  const fields = cleanModuleFields(await req.json().catch(() => ({})));
  if (!fields.title) return NextResponse.json({ error: "Give the module a title." }, { status: 400 });

  const mod = await createItem<TrainingModule>("module", { ...stamp(session.id), ...fields });
  await recordActivity({
    ...actorFrom(req, session),
    action: "training.module.created",
    entity: "training",
    entityId: mod.id,
    summary: `Added training module "${mod.title}"`,
  });
  return NextResponse.json(mod, { status: 201 });
}
