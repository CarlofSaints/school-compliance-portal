import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { getRuns } from "@/lib/reminderData";
import { ACTION_ADMIN_PERMISSIONS } from "@/lib/actionItemRecipients";

// The last few runs of the daily reminder cron.
//
// The run log has been written since the cron was built and nothing has ever
// shown it, which means a cron that stopped firing would look exactly like a
// cron with nothing to send. This is the page that can tell them apart.
export async function GET(req: NextRequest) {
  const session = await requireAnyPermission(req, [
    ...ACTION_ADMIN_PERMISSIONS,
    "manage_spend_settings",
  ]);
  if (session instanceof NextResponse) return session;

  const runs = await getRuns();
  return NextResponse.json(runs.slice(0, 10), {
    headers: { "Cache-Control": "no-store" },
  });
}
