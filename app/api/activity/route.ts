import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import {
  readActivity,
  exportActivity,
  activityToCsv,
  type ActivityEntity,
} from "@/lib/activityLog";
import { contentDisposition } from "@/lib/contentDisposition";

// Reading the audit trail is gated, but on ANY of these rather than one narrow
// key. A stored role that predates a new permission never gains it, so a
// brand-new "view_activity" alone would lock out every existing admin until
// somebody re-ticked it by hand. Anyone who can manage users, roles or spend
// settings is already trusted with more than this.
const CAN_VIEW = ["view_activity", "manage_users", "manage_roles", "manage_spend_settings"];

export async function GET(req: NextRequest) {
  const session = await requireAnyPermission(req, CAN_VIEW);
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
    const entries = await exportActivity(month);
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

  return NextResponse.json(page);
}
