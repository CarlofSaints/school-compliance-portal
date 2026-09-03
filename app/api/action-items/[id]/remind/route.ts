import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { getActionItemById } from "@/lib/actionItemData";
import { ACTION_ADMIN_PERMISSIONS } from "@/lib/actionItemRecipients";
import { chaseActionItem } from "@/lib/actionItemNotify";
import { isEmailConfigured } from "@/lib/email";

export const maxDuration = 60;

// "Remind now" on the grid: the same chase the cron sends, on demand.
//
// It goes through chaseActionItem so a manual nudge leaves the same trail and
// resets the same clock - otherwise somebody chased by hand this morning gets
// the scheduled chase again tonight.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAnyPermission(req, ACTION_ADMIN_PERMISSIONS);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const item = await getActionItemById(id);
  if (!item) {
    return NextResponse.json({ error: "Action not found" }, { status: 404 });
  }

  if (!isEmailConfigured()) {
    return NextResponse.json(
      {
        error:
          "Email is not configured on this deployment, so nothing was sent. RESEND_API_KEY is missing.",
      },
      { status: 503 }
    );
  }

  let note = "";
  try {
    const body = await req.json();
    note = String(body?.note ?? "").trim().slice(0, 500);
  } catch {
    // A bare POST with no body is a plain nudge.
  }

  const outcome = await chaseActionItem(item, new Date(), note);
  return NextResponse.json({
    ...outcome,
    by: `${session.name} ${session.surname}`.trim(),
  });
}
