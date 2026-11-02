import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requireAnyPermission } from "@/lib/rolesData";
import { MINUTES_MANAGE_PERMISSIONS } from "@/lib/minutesAccessRules";
import {
  getMeetingTypes,
  addMeetingType,
  renameMeetingType,
  removeMeetingType,
  meetingTypeUsage,
  MeetingTypeError,
} from "@/lib/meetingTypesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

export const dynamic = "force-dynamic";

/** Anyone signed in: every minutes screen names the type. ?usage=1 (admins)
 *  adds how many minutes and templates use each, for the admin screen. */
export async function GET(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  const types = await getMeetingTypes();
  if (req.nextUrl.searchParams.get("usage") === "1") {
    if (!session.permissions.some((p) => MINUTES_MANAGE_PERMISSIONS.includes(p))) {
      return NextResponse.json({ error: "Not permitted" }, { status: 403 });
    }
    const usage = await meetingTypeUsage();
    return NextResponse.json(
      {
        types: types.map((t) => ({
          ...t,
          minutes: usage[t.id]?.minutes.length ?? 0,
          templates: usage[t.id]?.templates.length ?? 0,
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json({ types }, { headers: { "Cache-Control": "no-store" } });
}

/** { action: "add", label } | { action: "rename", id, label } | { action: "remove", id } */
export async function POST(req: NextRequest) {
  const session = await requireAnyPermission(req, MINUTES_MANAGE_PERMISSIONS);
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  try {
    const before = (await getMeetingTypes()).find((t) => t.id === id);
    const label = String(body.label ?? "").trim();
    let summary: string;
    let types;
    if (body.action === "add") {
      types = await addMeetingType(body.label);
      summary = `Added the meeting type "${label}"`;
    } else if (body.action === "rename") {
      types = await renameMeetingType(id, body.label);
      summary = `Renamed the meeting type "${before?.label ?? id}" to "${label}"`;
    } else if (body.action === "remove") {
      types = await removeMeetingType(id);
      summary = `Removed the meeting type "${before?.label ?? id}"`;
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    await recordActivity({ ...actorFrom(req, session), action: "minutes.meeting_types_changed", entity: "minutes", entityId: id || "meeting-types", summary });
    // The list as just written: a read now could still serve the old copy.
    return NextResponse.json({ types });
  } catch (err) {
    if (err instanceof MeetingTypeError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
