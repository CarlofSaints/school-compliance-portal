import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platformAdmin";
import { runAsTenant } from "@/lib/tenantContext";
import {
  readActivity,
  exportActivity,
  activityToCsv,
  recordActivity,
  type ActivityEntity,
} from "@/lib/activityLog";
import { contentDisposition } from "@/lib/contentDisposition";

// One school's audit trail, read by Carl rather than by the school.
//
// 🔴 Looking at a school's records is itself recorded, IN THAT SCHOOL'S OWN
// LOG. A platform operator who can read everything and leaves no trace is
// exactly the gap an audit trail is supposed to close, and a school that can
// see when its data was accessed has a reason to trust the rest of the log.
// See [[audit-log-beats-the-operators-account]].
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;

  const { key } = await params;
  const sp = req.nextUrl.searchParams;
  const month = sp.get("month") || undefined;
  const wantsCsv = sp.get("format") === "csv";

  try {
    return await runAsTenant(key, async () => {
      if (wantsCsv) {
        if (!month) {
          return NextResponse.json(
            { error: "An export needs a month." },
            { status: 400 }
          );
        }
        const entries = await exportActivity(month);

        await recordActivity({
          actorName: `${admin.email} (School Compliance support)`,
          actorEmail: admin.email,
          action: "activity.exported.by_platform",
          entity: "system",
          summary: `Support exported this school's activity log for ${month}`,
          detail: { month, entries: entries.length },
        });

        return new Response(activityToCsv(entries), {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": contentDisposition(`${key}-activity-${month}.csv`),
          },
        });
      }

      const page = await readActivity({
        month,
        limit: Number(sp.get("limit")) || 100,
        offset: Number(sp.get("offset")) || 0,
        entity: (sp.get("entity") as ActivityEntity) || undefined,
        search: sp.get("search") || undefined,
      });

      // Only the first page is logged. Recording an entry for every page turn
      // would bury the school's own activity under our browsing of it.
      if (!sp.get("offset")) {
        await recordActivity({
          actorName: `${admin.email} (School Compliance support)`,
          actorEmail: admin.email,
          action: "activity.viewed.by_platform",
          entity: "system",
          summary: `Support viewed this school's activity log for ${page.month}`,
          detail: { month: page.month },
        });
      }

      return NextResponse.json(page);
    });
  } catch (err) {
    console.error(`[platform] Activity for "${key}" failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read that school." },
      { status: 404 }
    );
  }
}
