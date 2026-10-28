import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import {
  getActionItemById,
  updateActionItem,
  STATUS_LABELS,
} from "@/lib/actionItemData";
import type { ActionStatus } from "@/lib/actionItemData";
import { normalise } from "@/lib/actionItems";
import { withHistoryLine, notOwnerReasonOf, NEEDS_REASON } from "@/lib/actionItemFields";
import { isAssignee } from "@/lib/actionItemRecipients";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { withMinutesMeetingDates, visibleActionsFor } from "@/lib/minutesAccess";

const VALID_STATUSES = Object.keys(STATUS_LABELS) as ActionStatus[];

// Updating progress on an action.
//
// Deliberately NOT behind manage_action_items: the person doing the work is the
// one who knows how far along it is, and most SGB members will never hold an
// admin permission. Anybody who can see the action may update it, but someone
// not assigned to it (an administrator included) must say why, and the reason
// is kept on the update. Everything else about an action - who carries it,
// when it is due - stays on PATCH behind the manage permission.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const item = await getActionItemById(id);
  if (!item) {
    return NextResponse.json({ error: "Action not found" }, { status: 404 });
  }

  const [visible, owner] = await Promise.all([
    visibleActionsFor(session, [item]),
    isAssignee(item, session),
  ]);
  // An action from restricted minutes stays invisible to whoever cannot see it.
  if (visible.length === 0) {
    return NextResponse.json({ error: "Action not found" }, { status: 404 });
  }
  // History keeps the last 100 lines, so someone not on the action must not be
  // able to push the real record out with a burst of updates.
  if (!owner) {
    const limited = await enforce([[LIMITS.actionUpdateUser, session.id]]);
    if (limited) return limited;
  }

  try {
    const body = await req.json();

    const raw =
      body?.progress === undefined ? item.progress : Number(body.progress);
    if (!Number.isFinite(raw)) {
      return NextResponse.json(
        { error: "Progress must be a number between 0 and 100" },
        { status: 400 }
      );
    }

    const status: ActionStatus = VALID_STATUSES.includes(body?.status)
      ? body.status
      : item.status;
    const note = String(body?.note ?? "").trim().slice(0, 2000);

    // Compared as it would be SAVED (done forces 100%, progress lifts not
    // started), so a figure the server would change anyway is not a "move".
    const after = normalise({ ...item, progress: raw, status });
    const moved = after.status !== item.status || after.progress !== item.progress;
    if (!moved && !note) {
      return NextResponse.json(
        { error: "Nothing to save: change the status or progress, or write a note." },
        { status: 400 }
      );
    }
    // Not assigned to it (an administrator included): moving the status or
    // progress needs a reason. A note on its own does not.
    const notOwnerReason = owner || !moved ? "" : notOwnerReasonOf(body);
    if (!owner && moved && !notOwnerReason) {
      return NextResponse.json(NEEDS_REASON, { status: 400 });
    }

    // Every change writes a line in the log, note or no note. A progress figure
    // that moved with nobody's name on it is the thing an SGB meeting cannot
    // resolve six weeks later. A note-only update leaves status and progress
    // alone, so it cannot put back a value someone changed a moment ago.
    const saved = await updateActionItem(
      id,
      withHistoryLine(
        moved ? { progress: after.progress, status: after.status } : {},
        { id: session.id, name: `${session.name} ${session.surname}`.trim() },
        note,
        notOwnerReason
      )
    );

    return NextResponse.json(saved && (await withMinutesMeetingDates(session, [saved]))[0]);
  } catch (err) {
    console.error("[action-items] progress update failed:", err);
    return NextResponse.json(
      { error: "Could not save that update" },
      { status: 500 }
    );
  }
}
