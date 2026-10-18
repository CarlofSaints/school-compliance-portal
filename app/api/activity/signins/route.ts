import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { getUsers } from "@/lib/userData";
import { readSignInStats, trackingSince, buildSignInRows } from "@/lib/signinLog";
import { ACTIVITY_VIEW_PERMISSIONS } from "@/lib/activityLog";

// The Sign-ins view on the Activity page. Same ANY-of gate as /api/activity,
// so exactly the people who can read the log can read this.

export async function GET(req: NextRequest) {
  const session = await requireAnyPermission(req, ACTIVITY_VIEW_PERMISSIONS);
  if (session instanceof NextResponse) return session;

  const [users, stats, since] = await Promise.all([getUsers(), readSignInStats(), trackingSince()]);
  return NextResponse.json({ rows: buildSignInRows(users, stats, since), since });
}
