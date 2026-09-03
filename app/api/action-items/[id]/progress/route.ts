import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import {
  getActionItemById,
  updateActionItem,
  STATUS_LABELS,
} from "@/lib/actionItemData";
import type { ActionStatus, ActionUpdate } from "@/lib/actionItemData";
import {
  ACTION_ADMIN_PERMISSIONS,
  isAssignee,
} from "@/lib/actionItemRecipients";
import { v4 as uuidv4 } from "uuid";

const VALID_STATUSES = Object.keys(STATUS_LABELS) as ActionStatus[];

// Updating progress on an action.
//
// Deliberately NOT behind manage_action_items: the person doing the work is the
// one who knows how far along it is, and most SGB members will never hold an
// admin permission. Anybody assigned may update their own action; an
// administrator may update anybody's. Everything else about an action - who
// carries it, when it is due - stays on PATCH behind the manage permission.
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

  const isAdmin = session.permissions.some((p) =>
    ACTION_ADMIN_PERMISSIONS.includes(p)
  );
  if (!isAdmin && !(await isAssignee(item, session.id))) {
    return NextResponse.json(
      { error: "Only the people assigned to this action can update it" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();

    const progress =
      body?.progress === undefined ? item.progress : Number(body.progress);
    if (!Number.isFinite(progress)) {
      return NextResponse.json(
        { error: "Progress must be a number between 0 and 100" },
        { status: 400 }
      );
    }

    const status: ActionStatus = VALID_STATUSES.includes(body?.status)
      ? body.status
      : item.status;
    const note = String(body?.note ?? "").trim().slice(0, 2000);

    // Every change writes a line in the log, note or no note. A progress figure
    // that moved with nobody's name on it is the thing an SGB meeting cannot
    // resolve six weeks later.
    const update: ActionUpdate = {
      id: uuidv4(),
      at: new Date().toISOString(),
      byId: session.id,
      byName: `${session.name} ${session.surname}`.trim(),
      note,
      progress: Math.max(0, Math.min(100, Math.round(progress))),
      status,
    };

    const saved = await updateActionItem(id, {
      progress,
      status,
      // Newest first, so the grid's "last update" column is updates[0].
      updates: [update, ...item.updates].slice(0, 100),
    });

    return NextResponse.json(saved);
  } catch (err) {
    console.error("[action-items] progress update failed:", err);
    return NextResponse.json(
      { error: "Could not save that update" },
      { status: 500 }
    );
  }
}
