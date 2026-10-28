import { NextRequest, NextResponse } from "next/server";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { requireAnyPermission } from "@/lib/rolesData";
import { getPeople } from "@/lib/peopleData";
import { getUsers } from "@/lib/userData";
import { getActionItems, updateActionItems } from "@/lib/actionItemData";
import type { ActionChange } from "@/lib/actionItemData";
import { ACTION_ADMIN_PERMISSIONS, myPersonIdsIn } from "@/lib/actionItemRecipients";
import { parseActionEdit, isNotOwnerStatusChange, withHistoryLine, notOwnerReasonOf } from "@/lib/actionItemFields";
import { getActionCategories } from "@/lib/actionCategoryData";
import { notifyAssignees } from "@/lib/actionItemNotify";
import { withMinutesMeetingDates } from "@/lib/minutesAccess";

export const maxDuration = 300;

const MAX_ROWS = 200;

// Editing several actions at once - reassigning a departing member's list,
// putting an ETA on a whole term's items, closing off a batch after a meeting.
//
// This exists because looping PATCH over several actions LOSES some of them.
// Each write is a read-modify-write of the whole store, so a later one built on
// a stale read erases an earlier one. Five assignments sent in a row, each
// answering 200, left two. Anything touching more than one action comes here.
export async function POST(req: NextRequest) {
  const session = await requireAnyPermission(req, ACTION_ADMIN_PERMISSIONS);
  if (session instanceof NextResponse) return session;

  // Sends email (paid, Resend): per person per hour.
  const emailLimited = await enforce([[LIMITS.emailSendUser, session.id]]);
  if (emailLimited) return emailLimited;

  try {
    const body = await req.json();
    const rows: Record<string, unknown>[] = Array.isArray(body?.updates)
      ? body.updates
      : [];

    if (rows.length === 0) {
      return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `That is more than ${MAX_ROWS} actions in one go` },
        { status: 400 }
      );
    }

    const [items, people, users, categories] = await Promise.all([
      getActionItems(),
      getPeople(),
      getUsers(),
      getActionCategories(),
    ]);
    const byId = new Map(items.map((i) => [i.id, i]));
    const mine = myPersonIdsIn(people, session);
    const by = { id: session.id, name: `${session.name} ${session.surname}`.trim() };

    const edits: {
      id: string;
      updates: ActionChange;
    }[] = [];
    const newlyAssignedBy = new Map<string, string[]>();
    const problems: string[] = [];
    let notOwnerRows = 0;

    const seen = new Set<string>();
    for (const row of rows) {
      const id = String(row?.id ?? "");
      // One row per action: repeats would each add a history line (and one
      // call could then flood an action's history for a single limit charge).
      if (seen.has(id)) {
        problems.push(`${id || "(no id)"} appears more than once`);
        continue;
      }
      seen.add(id);
      const existing = byId.get(id);
      if (!existing) {
        problems.push(`${id || "(no id)"} is not an action on the register`);
        continue;
      }
      const parsed = parseActionEdit(row, existing, people, users, categories);
      if (parsed.error) {
        problems.push(`${existing.ref}: ${parsed.error}`);
        continue;
      }
      // Not assigned to it: moving its status needs a reason, admins included.
      const reason = notOwnerReasonOf(row);
      const notOwner = isNotOwnerStatusChange(existing, parsed.updates, mine);
      if (notOwner && !reason) {
        problems.push(`${existing.ref}: you are not assigned to it, so say why you are changing its status (notOwnerReason)`);
        continue;
      }
      if (notOwner) notOwnerRows++;
      edits.push({ id, updates: notOwner ? withHistoryLine(parsed.updates, by, "", reason) : parsed.updates });
      if (parsed.newlyAssigned.length > 0) {
        newlyAssignedBy.set(id, parsed.newlyAssigned);
      }
    }

    // All or nothing. A half-applied bulk change is the worst outcome: the
    // caller cannot tell which half, and re-running it is not safe either.
    if (problems.length > 0) {
      return NextResponse.json(
        { error: "Nothing was changed", problems },
        { status: 400 }
      );
    }

    // One charge per call that writes non-owner history lines, the same limit
    // as Update progress and Edit. A call writes at most one line per action,
    // so flooding one action's history still takes a call per line; charging
    // per row would make closing 40 actions after a meeting impossible.
    if (notOwnerRows > 0) {
      const limited = await enforce([[LIMITS.actionUpdateUser, session.id]]);
      if (limited) return limited;
    }

    const { saved, missing } = await updateActionItems(edits);

    let notified = 0;
    if (body?.notify === true) {
      for (const item of saved) {
        const newly = newlyAssignedBy.get(item.id);
        if (newly?.length) notified += await notifyAssignees(item, newly);
      }
    }

    return NextResponse.json({
      changed: saved.length,
      refs: saved.map((s) => s.ref),
      notified,
      missing,
      items: await withMinutesMeetingDates(session, saved),
    });
  } catch (err) {
    console.error("[action-items] bulk update failed:", err);
    return NextResponse.json(
      { error: "Could not apply those changes" },
      { status: 500 }
    );
  }
}
