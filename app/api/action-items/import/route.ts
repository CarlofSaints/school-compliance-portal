import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { getPeople } from "@/lib/peopleData";
import { getUsers } from "@/lib/userData";
import {
  createActionItems,
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

export const maxDuration = 300;

const VALID_STATUSES = Object.keys(STATUS_LABELS) as ActionStatus[];
const VALID_PRIORITIES: ActionPriority[] = ["low", "medium", "high"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 200;

interface ImportRow {
  title?: unknown;
  description?: unknown;
  assigneeIds?: unknown;
  category?: unknown;
  priority?: unknown;
  dueDate?: unknown;
  meetingDate?: unknown;
  status?: unknown;
  progress?: unknown;
  reminder?: unknown;
}

// Loading a term's action list in one go, from a set of minutes.
//
// Deliberately one request rather than a POST per row: each create is a
// read-modify-write of the whole store, so a run of them loses rows to the
// read lag. See createActionItems.
//
// Rows are all-or-nothing. A half-loaded action list is worse than a failed
// import, because nobody can tell which half is missing.
export async function POST(req: NextRequest) {
  const session = await requireAnyPermission(req, ACTION_ADMIN_PERMISSIONS);
  if (session instanceof NextResponse) return session;

  try {
    const body = await req.json();
    const rows: ImportRow[] = Array.isArray(body?.items) ? body.items : [];

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No rows to import" },
        { status: 400 }
      );
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `That is more than ${MAX_ROWS} rows in one go` },
        { status: 400 }
      );
    }

    const [people, users] = await Promise.all([getPeople(), getUsers()]);
    const now = new Date().toISOString();
    const problems: string[] = [];

    const drafts: Omit<ActionItem, "ref">[] = [];
    rows.forEach((row, i) => {
      const title = String(row?.title ?? "").trim();
      if (!title) {
        problems.push(`Row ${i + 1} has no action name`);
        return;
      }

      const dueDate = String(row?.dueDate ?? "").trim();
      if (dueDate && !ISO_DATE.test(dueDate)) {
        problems.push(`Row ${i + 1} (${title}) has an unreadable ETA`);
        return;
      }

      // An id that is not on the register is reported, never silently dropped:
      // an action quietly landing on nobody is the failure this whole module
      // exists to prevent.
      const wanted: string[] = Array.isArray(row?.assigneeIds)
        ? [...new Set((row.assigneeIds as unknown[]).map((v) => String(v)))]
        : [];
      const assigneeIds = wanted.filter((id) =>
        people.some((p) => p.id === id)
      );
      for (const missing of wanted.filter((id) => !assigneeIds.includes(id))) {
        problems.push(`Row ${i + 1} (${title}): ${missing} is not on the register`);
      }

      drafts.push({
        id: uuidv4(),
        title: title.slice(0, 200),
        description: String(row?.description ?? "").trim().slice(0, 4000),
        assigneeIds,
        assigneeNames: assigneeIds.map((id) =>
          displayNameFor(id, people, users)
        ),
        category: ACTION_CATEGORIES.includes(String(row?.category))
          ? String(row.category)
          : "Other",
        priority: VALID_PRIORITIES.includes(row?.priority as ActionPriority)
          ? (row.priority as ActionPriority)
          : "medium",
        dueDate,
        status: VALID_STATUSES.includes(row?.status as ActionStatus)
          ? (row.status as ActionStatus)
          : "not_started",
        progress: Number(row?.progress ?? 0),
        updates: [],
        reminder: parseReminder(row?.reminder),
        meetingDate: ISO_DATE.test(String(row?.meetingDate ?? ""))
          ? String(row.meetingDate)
          : undefined,
        raisedById: session.id,
        raisedByName: `${session.name} ${session.surname}`.trim(),
        createdAt: now,
        updatedAt: now,
      });
    });

    if (drafts.length !== rows.length) {
      return NextResponse.json(
        {
          error: "Nothing was imported - some rows could not be read",
          problems,
        },
        { status: 400 }
      );
    }

    const created = await createActionItems(drafts);

    // Off by default. An import is a filing exercise, and mailing a dozen
    // people about a list they have already seen in the minutes is noise.
    let notified = 0;
    if (body?.notify === true) {
      for (const item of created) {
        notified += await notifyAssignees(item);
      }
    }

    return NextResponse.json(
      {
        imported: created.length,
        refs: created.map((c) => c.ref),
        notified,
        problems,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[action-items] import failed:", err);
    return NextResponse.json(
      { error: "Could not import that list" },
      { status: 500 }
    );
  }
}
