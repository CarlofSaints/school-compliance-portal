import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { getUsers } from "@/lib/userData";
import { readSignInStats, trackingSince, buildSignInRows } from "@/lib/signinLog";
import { ACTIVITY_VIEW_PERMISSIONS } from "@/lib/activityAccess";

// The Sign-ins view on the Activity page. Same ANY-of gate as /api/activity,
// so exactly the people who can read the log can read this.

export async function GET(req: NextRequest) {
  const session = await requireAnyPermission(req, ACTIVITY_VIEW_PERMISSIONS);
  if (session instanceof NextResponse) return session;

  // Admin > Users needs only the last sign-in per user: no user list, no
  // tracking date, no day maths.
  if (req.nextUrl.searchParams.get("lastOnly") === "1") {
    const stats = await readSignInStats();
    const last: Record<string, string> = {};
    for (const [id, s] of Object.entries(stats)) if (s.lastAt) last[id] = s.lastAt;
    return NextResponse.json({ last });
  }

  const [users, stats, since] = await Promise.all([getUsers(), readSignInStats(), trackingSince()]);
  return NextResponse.json({ rows: buildSignInRows(users, stats, since), since });
}
