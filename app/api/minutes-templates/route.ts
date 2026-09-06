import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requireAnyPermission } from "@/lib/rolesData";
import { listTemplates, createTemplate } from "@/lib/minutesTemplates";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

const CAN_MANAGE = ["manage_minutes", "manage_users"];

// Reading needs only a login: the secretary picks a template when starting
// minutes, and gating the list would break the one flow it exists for.
export async function GET(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  return NextResponse.json(await listTemplates());
}

export async function POST(req: NextRequest) {
  const session = await requireAnyPermission(req, CAN_MANAGE);
  if (session instanceof NextResponse) return session;

  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Give the template a name." }, { status: 400 });
    }
    if (!Array.isArray(body.sections) || body.sections.length === 0) {
      return NextResponse.json(
        { error: "A template needs at least one section." },
        { status: 400 }
      );
    }

    const template = await createTemplate({
      name,
      body: body.body,
      description: body.description,
      sections: body.sections,
      createdBy: session.email,
    });

    await recordActivity({
      ...actorFrom(req, session),
      action: "minutes.template.created",
      entity: "minutes",
      entityId: template.id,
      summary: `Created the minutes template "${name}"`,
      detail: { sections: template.sections.length, meeting: template.body },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    console.error("[minutes templates] Create failed:", err);
    return NextResponse.json({ error: "Could not save the template." }, { status: 500 });
  }
}
