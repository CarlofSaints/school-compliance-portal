import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { getPeople } from "@/lib/peopleData";
import { getUsers } from "@/lib/userData";
import {
  getActionItemById,
  updateActionItem,
  deleteActionItem,
} from "@/lib/actionItemData";
import { ACTION_ADMIN_PERMISSIONS } from "@/lib/actionItemRecipients";
import { parseActionEdit, isNotOwnerStatusChange, withNotOwnerReason } from "@/lib/actionItemFields";
import { getActionCategories } from "@/lib/actionCategoryData";
import { notifyAssignees } from "@/lib/actionItemNotify";
import { withMinutesMeetingDates } from "@/lib/minutesAccess";

// Editing ONE action. An assignee updating their own progress goes to
// /progress instead, which needs no permission - see that route.
//
// ⚠️ Do not loop this to change several actions: each call is a
// read-modify-write of the whole store, so a later one built on a stale read
// erases an earlier one. Use POST /api/action-items/bulk.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAnyPermission(req, ACTION_ADMIN_PERMISSIONS);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const existing = await getActionItemById(id);
  if (!existing) {
    return NextResponse.json({ error: "Action not found" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const [people, users, categories] = await Promise.all([
      getPeople(),
      getUsers(),
      getActionCategories(),
    ]);

    // Shared with the bulk route, so the two cannot drift on what a valid edit
    // is - the sort of split where one validates an ETA and the other stores
    // rubbish.
    const parsed = parseActionEdit(body, existing, people, users, categories);
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    // Not assigned to it: moving its status needs a reason, admins included.
    const mine = people.filter((p) => p.userId === session.id).map((p) => p.id);
    const reason = String(body.notOwnerReason ?? "").trim().slice(0, 2000);
    const notOwner = isNotOwnerStatusChange(existing, parsed.updates, mine);
    if (notOwner && !reason) {
      return NextResponse.json(
        { error: "You are not assigned to this action. Say why you are changing its status.", needsReason: true },
        { status: 400 }
      );
    }

    const by = { id: session.id, name: `${session.name} ${session.surname}`.trim() };
    const saved = await updateActionItem(
      id,
      notOwner ? withNotOwnerReason(parsed.updates, by, reason) : parsed.updates
    );
    if (!saved) {
      return NextResponse.json({ error: "Action not found" }, { status: 404 });
    }

    // Only the people who were not on it before, so an edit does not re-mail
    // everybody who was already carrying the action.
    let notified = 0;
    if (body.notify !== false && parsed.newlyAssigned.length > 0) {
      notified = await notifyAssignees(saved, parsed.newlyAssigned);
    }

    const [dated] = await withMinutesMeetingDates(session, [saved]);
    return NextResponse.json({ ...dated, notified });
  } catch (err) {
    console.error("[action-items] update failed:", err);
    return NextResponse.json(
      { error: "Could not save that change" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAnyPermission(req, ACTION_ADMIN_PERMISSIONS);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const ok = await deleteActionItem(id);
  if (!ok) {
    return NextResponse.json({ error: "Action not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
