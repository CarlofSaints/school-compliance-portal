import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import {
  readActivity,
  exportActivity,
  activityToCsv,
  type ActivityEntity,
} from "@/lib/activityLog";
import { ACTIVITY_VIEW_PERMISSIONS } from "@/lib/activityAccess";
import { contentDisposition } from "@/lib/contentDisposition";
import { redactMinutesActivity } from "@/lib/minutesAccess";

// Reading the audit trail is gated ANY-of (lib/activityAccess.ts). Anyone who
// can manage users, roles or spend settings is already trusted with more.

export async function GET(req: NextRequest) {
  const session = await requireAnyPermission(req, ACTIVITY_VIEW_PERMISSIONS);
  if (session instanceof NextResponse) return session;

  const sp = req.nextUrl.searchParams;
  const month = sp.get("month") || undefined;

  if (sp.get("format") === "csv") {
    if (!month) {
      return NextResponse.json(
        { error: "An export needs a month." },
        { status: 400 }
      );
    }
    const entries = await redactMinutesActivity(session, await exportActivity(month));
    const csv = activityToCsv(entries);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        // Via the helper because a school name can carry an accent, and an
        // HTTP header is Latin-1: a bare filename with one in it throws.
        "Content-Disposition": contentDisposition(`activity-${month}.csv`),
      },
    });
  }

  const page = await readActivity({
    month,
    limit: Number(sp.get("limit")) || 100,
    offset: Number(sp.get("offset")) || 0,
    entity: (sp.get("entity") as ActivityEntity) || undefined,
    actorId: sp.get("actorId") || undefined,
    search: sp.get("search") || undefined,
  });

  return NextResponse.json({ ...page, entries: await redactMinutesActivity(session, page.entries) });
}
