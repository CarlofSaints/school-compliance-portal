import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import {
  getRecipientSettings,
  saveRecipientSettings,
  resolveAudience,
  tagChoices,
  AUDIENCE_LABELS,
  type MinutesAudience,
} from "@/lib/minutesRecipients";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

const CAN_MANAGE = ["manage_minutes", "manage_users"];

// Returns the mapping AND a preview of who each list currently resolves to, so
// an admin can see the actual names rather than trusting a tag to be right.
// A distribution list nobody has checked is how somebody gets left off.
export async function GET(req: NextRequest) {
  const session = await requireAnyPermission(req, CAN_MANAGE);
  if (session instanceof NextResponse) return session;

  const settings = await getRecipientSettings();
  const audiences = Object.keys(AUDIENCE_LABELS) as MinutesAudience[];
  const preview: Record<string, unknown> = {};
  for (const a of audiences) {
    const r = await resolveAudience(a, settings);
    preview[a] = {
      to: r.to.map((x) => x.name),
      cc: r.cc.map((x) => x.name),
      withoutEmail: r.withoutEmail,
    };
  }

  return NextResponse.json({ settings, tags: await tagChoices(), preview });
}

export async function PUT(req: NextRequest) {
  const session = await requireAnyPermission(req, CAN_MANAGE);
  if (session instanceof NextResponse) return session;

  try {
    const body = await req.json();
    const saved = await saveRecipientSettings({
      to: body.to ?? {},
      cc: body.cc ?? {},
    });

    await recordActivity({
      ...actorFrom(req, session),
      action: "minutes.recipients.updated",
      entity: "minutes",
      summary: "Changed who receives minutes emails",
      detail: { configured: Object.keys(saved.to).length },
    });

    return NextResponse.json(saved);
  } catch (err) {
    console.error("[minutes recipients] Save failed:", err);
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}
