import { NextRequest, NextResponse } from "next/server";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { requireAnyPermission } from "@/lib/rolesData";
import { getActionItemById, updateActionItem } from "@/lib/actionItemData";
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

  // Sends email (paid, Resend): per person per hour.
  const emailLimited = await enforce([[LIMITS.emailSendUser, session.id]]);
  if (emailLimited) return emailLimited;

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

  let outcome;
  try {
    outcome = await chaseActionItem(item, new Date(), note);
  } catch (err) {
    // A read failed (the minutes behind a meeting action, say): nothing was
    // sent. Said on the item too, like the cron, and to the person who asked.
    const why = err instanceof Error ? err.message : String(err);
    console.error("[action-items] remind failed:", id, err);
    await updateActionItem(id, { lastReminderResult: `failed: ${why}`.slice(0, 300) }).catch(() => {});
    return NextResponse.json(
      { error: "The reminder could not be sent just now, so nothing went out. Please try again in a minute." },
      { status: 503 }
    );
  }
  return NextResponse.json({
    ...outcome,
    by: `${session.name} ${session.surname}`.trim(),
  });
}
