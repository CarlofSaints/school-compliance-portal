import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requireAnyPermission } from "@/lib/rolesData";
import { getTemplate, updateTemplate, deleteTemplate } from "@/lib/minutesTemplates";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

const CAN_MANAGE = ["manage_minutes", "manage_users"];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const template = await getTemplate(id);
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  return NextResponse.json(template);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAnyPermission(req, CAN_MANAGE);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  try {
    const body = await req.json();
    if (body.name !== undefined && !String(body.name).trim()) {
      return NextResponse.json({ error: "Give the template a name." }, { status: 400 });
    }
    if (body.sections !== undefined && (!Array.isArray(body.sections) || body.sections.length === 0)) {
      return NextResponse.json(
        { error: "A template needs at least one section." },
        { status: 400 }
      );
    }

    const saved = await updateTemplate(id, body);
    if (!saved) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    await recordActivity({
      ...actorFrom(req, session),
      action: "minutes.template.updated",
      entity: "minutes",
      entityId: id,
      summary: `Edited the minutes template "${saved.name}"`,
      detail: { sections: saved.sections.length },
    });

    // What was SAVED, not a re-read: a read straight after a write can serve
    // the previous copy and make a good save look like it failed.
    return NextResponse.json(saved);
  } catch (err) {
    console.error("[minutes templates] Update failed:", err);
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAnyPermission(req, CAN_MANAGE);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const existing = await getTemplate(id);
  if (!existing) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Safe at any time: minutes COPY their sections, so no existing record
  // depends on this and nothing already written changes.
  await deleteTemplate(id);
  await recordActivity({
    ...actorFrom(req, session),
    action: "minutes.template.deleted",
    entity: "minutes",
    entityId: id,
    summary: `Deleted the minutes template "${existing.name}"`,
  });
  return NextResponse.json({ success: true });
}
