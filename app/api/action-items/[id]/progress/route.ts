import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import {
  getActionItemById,
  updateActionItem,
  STATUS_LABELS,
} from "@/lib/actionItemData";
import type { ActionStatus, ActionUpdate } from "@/lib/actionItemData";
import { isAssignee } from "@/lib/actionItemRecipients";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { withMinutesMeetingDates, visibleActionsFor } from "@/lib/minutesAccess";
import { v4 as uuidv4 } from "uuid";

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
    isAssignee(item, session.id),
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
    const progress = Math.max(0, Math.min(100, Math.round(raw)));

    // Not assigned to it (an administrator included): moving the status or
    // progress needs a reason. A note on its own does not.
    const moved = status !== item.status || progress !== item.progress;
    const notOwnerReason = owner || !moved ? "" : String(body?.notOwnerReason ?? "").trim().slice(0, 2000);
    if (!owner && moved && !notOwnerReason) {
      return NextResponse.json(
        { error: "You are not assigned to this action. Say why you are changing its status.", needsReason: true },
        { status: 400 }
      );
    }

    // Every change writes a line in the log, note or no note. A progress figure
    // that moved with nobody's name on it is the thing an SGB meeting cannot
    // resolve six weeks later.
    const update: ActionUpdate = {
      id: uuidv4(),
      at: new Date().toISOString(),
      byId: session.id,
      byName: `${session.name} ${session.surname}`.trim(),
      note,
      progress,
      status,
      ...(notOwnerReason ? { notOwnerReason } : {}),
    };

    // A function of the action AS IT IS NOW: two people posting an update at
    // the same moment must both land, so the list is never built from the
    // copy read at the top of this request.
    const saved = await updateActionItem(id, (current) => ({
      progress,
      status,
      // Newest first, so the grid's "last update" column is updates[0].
      updates: [update, ...(current.updates || [])].slice(0, 100),
    }));

    return NextResponse.json(saved && (await withMinutesMeetingDates(session, [saved]))[0]);
  } catch (err) {
    console.error("[action-items] progress update failed:", err);
    return NextResponse.json(
      { error: "Could not save that update" },
      { status: 500 }
    );
  }
}
