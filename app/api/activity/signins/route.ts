import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { getUsers } from "@/lib/userData";
import { readSignInSummaries, buildSignInRows } from "@/lib/signinLog";

// The Sign-ins view on the Activity page. Same ANY-of gate as /api/activity,
// so exactly the people who can read the log can read this.
const CAN_VIEW = ["view_activity", "manage_users", "manage_roles", "manage_spend_settings"];

export async function GET(req: NextRequest) {
  const session = await requireAnyPermission(req, CAN_VIEW);
  if (session instanceof NextResponse) return session;

  const [users, summaries] = await Promise.all([getUsers(), readSignInSummaries()]);
  return NextResponse.json({ rows: buildSignInRows(users, summaries) });
}
