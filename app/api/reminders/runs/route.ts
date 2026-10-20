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
  // carry their titles: those of actions this reader may not see are cut.
  const items = await getActionItems();
  const visible = new Set((await visibleActionsFor(session, items)).map((i) => i.id));
  const hidden = items.filter((i) => !visible.has(i.id)).map((i) => [`Action ${i.ref} ${i.title}:`, `Action ${i.ref}:`]);
  const redacted = hidden.length
    ? runs.map((run) => ({
        ...run,
        detail: run.detail.map((line) => {
          const hit = hidden.find(([full]) => line.startsWith(full));
          return hit ? hit[1] + line.slice(hit[0].length) : line;
        }),
      }))
    : runs;
  return NextResponse.json(redacted, {
    headers: { "Cache-Control": "no-store" },
  });
}
