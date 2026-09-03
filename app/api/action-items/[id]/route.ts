import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { getPeople } from "@/lib/peopleData";
import { getUsers } from "@/lib/userData";
import {
  getActionItemById,
  updateActionItem,
  deleteActionItem,
  parseReminder,
  ACTION_CATEGORIES,
  STATUS_LABELS,
} from "@/lib/actionItemData";
import type {
  ActionItem,
  ActionPriority,
  ActionStatus,
} from "@/lib/actionItemData";
import {
  ACTION_ADMIN_PERMISSIONS,
  displayNameFor,
} from "@/lib/actionItemRecipients";
import { notifyAssignees } from "@/lib/actionItemNotify";

const VALID_STATUSES = Object.keys(STATUS_LABELS) as ActionStatus[];
const VALID_PRIORITIES: ActionPriority[] = ["low", "medium", "high"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Editing anybody's action. An assignee updating their OWN progress goes to
// /progress instead, which needs no permission - see that route.
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
    const updates: Partial<ActionItem> = {};

    // Every field is applied only when the caller actually sent it. A PATCH
    // that names three fields must not blank the other nine - the edit form
    // sends the whole record, but the inline grid controls send one field.
    if (typeof body.title === "string") {
      const title = body.title.trim();
      if (!title) {
        return NextResponse.json(
          { error: "An action needs a name" },
          { status: 400 }
        );
      }
      updates.title = title.slice(0, 200);
    }
    if (typeof body.description === "string") {
      updates.description = body.description.trim().slice(0, 4000);
    }
    if (typeof body.category === "string" && ACTION_CATEGORIES.includes(body.category)) {
      updates.category = body.category;
    }
    if (VALID_PRIORITIES.includes(body.priority)) {
      updates.priority = body.priority;
    }
    if (VALID_STATUSES.includes(body.status)) {
      updates.status = body.status;
    }
    if (body.progress !== undefined) {
      updates.progress = Number(body.progress);
    }
    if (typeof body.dueDate === "string") {
      if (body.dueDate && !ISO_DATE.test(body.dueDate)) {
        return NextResponse.json({ error: "Invalid ETA" }, { status: 400 });
      }
      // Moving the ETA re-opens the reminder sequence.
      //
      // Pushing a date OUT sorts itself out - the old chase then falls before
      // the new heads-up date. Pulling one IN is what needs this: the old chase
      // is already past the new ETA, so nextReminderOn drops through to the
      // weekly branch and nobody hears that the date has moved closer. Cleared,
      // it chases on the next run. See scripts/check-action-reminders.ts.
      if (body.dueDate !== existing.dueDate) {
        updates.lastRemindedOn = undefined;
        updates.lastReminderResult = undefined;
      }
      updates.dueDate = body.dueDate;
    }
    if (typeof body.meetingDate === "string") {
      updates.meetingDate = ISO_DATE.test(body.meetingDate)
        ? body.meetingDate
        : undefined;
    }
    if (body.reminder !== undefined) {
      updates.reminder = parseReminder(body.reminder);
    }

    let newlyAssigned: string[] = [];
    if (Array.isArray(body.assigneeIds)) {
      const [people, users] = await Promise.all([getPeople(), getUsers()]);
      const ids = [...new Set<string>((body.assigneeIds as unknown[]).map((v) => String(v)))].filter((pid) =>
        people.some((p) => p.id === pid)
      );
      newlyAssigned = ids.filter((pid) => !existing.assigneeIds.includes(pid));
      updates.assigneeIds = ids;
      updates.assigneeNames = ids.map((pid) =>
        displayNameFor(pid, people, users)
      );
    }

    const saved = await updateActionItem(id, updates);
    if (!saved) {
      return NextResponse.json({ error: "Action not found" }, { status: 404 });
    }

    // Only the people who were not on it before, so an edit does not re-mail
    // everybody who was already carrying the action.
    let notified = 0;
    if (body.notify !== false && newlyAssigned.length > 0) {
      notified = await notifyAssignees(saved, newlyAssigned);
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
