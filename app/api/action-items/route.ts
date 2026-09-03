import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requireAnyPermission } from "@/lib/rolesData";
import { getPeople } from "@/lib/peopleData";
import { getUsers } from "@/lib/userData";
import {
  getActionItems,
  createActionItem,
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
import { v4 as uuidv4 } from "uuid";

const VALID_STATUSES = Object.keys(STATUS_LABELS) as ActionStatus[];
const VALID_PRIORITIES: ActionPriority[] = ["low", "medium", "high"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Reading the register is login-only, on purpose.
//
// Who agreed to do what by when is the same kind of information as the People
// directory: it belongs to everybody in the portal, and an assignee who cannot
// see their own action cannot act on it. Raising and editing sits behind
// manage_action_items - see POST.
export async function GET(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const [items, people, users] = await Promise.all([
    getActionItems(),
    getPeople(),
    getUsers(),
  ]);

  // Names are refreshed from the register on the way out, so an item does not
  // go stale when somebody updates their account or a position changes hands.
  // The stored name stays as the fallback for a person since removed.
  const withNames = items.map((item) => ({
    ...item,
    assigneeNames: item.assigneeIds.map((id, i) =>
      displayNameFor(id, people, users, item.assigneeNames[i] || "")
    ),
  }));

  return NextResponse.json(withNames, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  const session = await requireAnyPermission(req, ACTION_ADMIN_PERMISSIONS);
  if (session instanceof NextResponse) return session;

  try {
    const body = await req.json();

    const title = String(body?.title ?? "").trim();
    if (!title) {
      return NextResponse.json(
        { error: "An action needs a name" },
        { status: 400 }
      );
    }

    const dueDate = String(body?.dueDate ?? "").trim();
    if (dueDate && !ISO_DATE.test(dueDate)) {
      return NextResponse.json({ error: "Invalid ETA" }, { status: 400 });
    }

    const [people, users] = await Promise.all([getPeople(), getUsers()]);
    // Only ids that are actually in the register, so a stale picker cannot
    // assign an action to somebody who no longer exists.
    const assigneeIds: string[] = Array.isArray(body?.assigneeIds)
      ? [...new Set<string>((body.assigneeIds as unknown[]).map((v) => String(v)))].filter((id) =>
          people.some((p) => p.id === id)
        )
      : [];

    const status: ActionStatus = VALID_STATUSES.includes(body?.status)
      ? body.status
      : "not_started";
    const priority: ActionPriority = VALID_PRIORITIES.includes(body?.priority)
      ? body.priority
      : "medium";
    const category = ACTION_CATEGORIES.includes(String(body?.category))
      ? String(body.category)
      : "Other";

    const now = new Date().toISOString();
    const draft: Omit<ActionItem, "ref"> = {
      id: uuidv4(),
      title: title.slice(0, 200),
      description: String(body?.description ?? "").trim().slice(0, 4000),
      assigneeIds,
      assigneeNames: assigneeIds.map((id) => displayNameFor(id, people, users)),
      category,
      priority,
      dueDate,
      status,
      progress: Number(body?.progress ?? 0),
      updates: [],
      reminder: parseReminder(body?.reminder),
      meetingDate: ISO_DATE.test(String(body?.meetingDate ?? ""))
        ? String(body.meetingDate)
        : undefined,
      raisedById: session.id,
      raisedByName: `${session.name} ${session.surname}`.trim(),
      createdAt: now,
      updatedAt: now,
    };

    const item = await createActionItem(draft);

    let notified = 0;
    if (body?.notify !== false && assigneeIds.length > 0) {
      notified = await notifyAssignees(item);
    }

    return NextResponse.json({ ...item, notified }, { status: 201 });
  } catch (err) {
    console.error("[action-items] create failed:", err);
    return NextResponse.json(
      { error: "Could not save that action" },
      { status: 500 }
    );
  }
}
