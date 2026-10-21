import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { getRuns } from "@/lib/reminderData";
import { ACTION_ADMIN_PERMISSIONS } from "@/lib/actionItemRecipients";
import { getActionItems } from "@/lib/actionItemData";
import { visibleActionsFor } from "@/lib/minutesAccess";

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

  const runs = (await getRuns()).slice(0, 10);
  // Runs logged before the cron named meeting actions by reference only still
  // carry titles ("Action A-001 <title>: ..."). Matched on the reference
  // alone, so a renamed or deleted action is cut too: a titled line is kept
  // only for an action this reader may see now. "Action A-001: ..." carries
  // no title and stays.
  const items = await getActionItems();
  const visible = new Set((await visibleActionsFor(session, items)).map((i) => i.ref));
  const redacted = runs.map((run) => ({
    ...run,
    detail: run.detail.map((line) => {
      const ref = /^Action (A-\d+) /.exec(line)?.[1];
      return ref && !visible.has(ref) ? `Action ${ref}: details hidden` : line;
    }),
  }));
  return NextResponse.json(redacted, {
    headers: { "Cache-Control": "no-store" },
  });
}
