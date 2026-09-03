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
import { parseActionEdit } from "@/lib/actionItemFields";
import { notifyAssignees } from "@/lib/actionItemNotify";

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
    const [people, users] = await Promise.all([getPeople(), getUsers()]);

    // Shared with the bulk route, so the two cannot drift on what a valid edit
    // is - the sort of split where one validates an ETA and the other stores
    // rubbish.
    const parsed = parseActionEdit(body, existing, people, users);
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const saved = await updateActionItem(id, parsed.updates);
    if (!saved) {
      return NextResponse.json({ error: "Action not found" }, { status: 404 });
    }

    // Only the people who were not on it before, so an edit does not re-mail
    // everybody who was already carrying the action.
    let notified = 0;
    if (body.notify !== false && parsed.newlyAssigned.length > 0) {
      notified = await notifyAssignees(saved, parsed.newlyAssigned);
    }

    return NextResponse.json({ ...saved, notified });
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
