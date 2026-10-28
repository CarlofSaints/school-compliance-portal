import {
  STATUS_LABELS,
  matchActionCategory,
  movesStatus,
  normalise,
  parseReminder,
} from "./actionItems";
import type {
  ActionItem,
  ActionPriority,
  ActionStatus,
  ActionUpdate,
} from "./actionItems";
import { displayNameFor } from "./actionItemRecipients";
import type { Person } from "./peopleData";
import type { User } from "./userData";

const VALID_STATUSES = Object.keys(STATUS_LABELS) as ActionStatus[];
const VALID_PRIORITIES: ActionPriority[] = ["low", "medium", "high"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ParsedEdit {
  updates: Partial<ActionItem>;
  // People put on the action who were not on it before. Only these are mailed,
  // so an edit does not re-notify everybody already carrying it.
  newlyAssigned: string[];
  error?: string;
}

// A move (movesStatus, lib/actionItems) by someone not assigned (an administrator included) must carry
// a reason, the same as the Update progress box asks for.
export function isNotOwnerStatusChange(
  existing: ActionItem,
  updates: Partial<ActionItem>,
  myPersonIds: string[]
): boolean {
  return movesStatus(existing, updates) && !existing.assigneeIds.some((id) => myPersonIds.includes(id));
}

// The reason a non-owner sent, tidied. Empty when none was given.
export function notOwnerReasonOf(body: unknown): string {
  return String((body as { notOwnerReason?: unknown })?.notOwnerReason ?? "").trim().slice(0, 2000);
}

export const NEEDS_REASON = {
  error: "You are not assigned to this action. Say why you are changing its status.",
  needsReason: true,
};

// The ONE way a line is added to an action's history (Update progress, Edit,
// bulk): the edit plus a line saying who did it, built from the action AS IT IS
// NOW so a concurrent update is kept. The line records the status and progress
// as SAVED (after normalise: done forces 100%, progress lifts not started).
export function withHistoryLine(
  updates: Partial<ActionItem>,
  by: { id: string; name: string },
  note: string,
  notOwnerReason = ""
): (current: ActionItem) => Partial<ActionItem> {
  return (current) => {
    const after = normalise({ ...current, ...updates });
    const line: ActionUpdate = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      byId: by.id,
      byName: by.name,
      note,
      progress: after.progress,
      status: after.status,
      ...(notOwnerReason ? { notOwnerReason } : {}),
    };
    // Newest first, so the grid's "last update" column is updates[0].
    return { ...updates, updates: [line, ...(current.updates || [])].slice(0, 100) };
  };
}

// Turns an edit payload into the fields to write.
//
// Shared by the single PATCH and the bulk endpoint so the two cannot drift on
// what a valid edit is - the sort of split where one route validates an ETA and
// the other quietly stores rubbish.
export function parseActionEdit(
  body: Record<string, unknown>,
  existing: ActionItem,
  people: Person[],
  users: User[],
  // The school's saved category list, not the built-in defaults: a category
  // added in Admin has to be one an existing action can be moved to.
  categories: string[]
): ParsedEdit {
  const updates: Partial<ActionItem> = {};
  let newlyAssigned: string[] = [];

  // Every field is applied only when the caller actually sent it. A payload
  // naming three fields must not blank the other nine.
  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) {
      return { updates: {}, newlyAssigned: [], error: "An action needs a name" };
    }
    updates.title = title.slice(0, 200);
  }
  if (typeof body.description === "string") {
    updates.description = body.description.trim().slice(0, 4000);
  }
  if (body.category !== undefined) {
    const category = matchActionCategory(body.category, categories);
    // Unchanged is always allowed, so an item filed under a since-removed
    // category can still be saved without being forced onto a new one.
    if (category) updates.category = category;
    else if (body.category !== existing.category) {
      return {
        updates: {},
        newlyAssigned: [],
        error: `"${String(body.category)}" is not an action category`,
      };
    }
  }
  if (VALID_PRIORITIES.includes(body.priority as ActionPriority)) {
    updates.priority = body.priority as ActionPriority;
  }
  if (VALID_STATUSES.includes(body.status as ActionStatus)) {
    updates.status = body.status as ActionStatus;
  }
  if (body.progress !== undefined) {
    const progress = Number(body.progress);
    if (!Number.isFinite(progress)) {
      return { updates: {}, newlyAssigned: [], error: "Progress must be a number between 0 and 100" };
    }
    updates.progress = progress;
  }
  if (typeof body.dueDate === "string") {
    if (body.dueDate && !ISO_DATE.test(body.dueDate)) {
      return { updates: {}, newlyAssigned: [], error: "Invalid ETA" };
    }
    // Moving the ETA re-opens the reminder sequence.
    //
    // Pushing a date OUT sorts itself out - the old chase then falls before the
    // new heads-up date. Pulling one IN is what needs this: the old chase is
    // already past the new ETA, so nextReminderOn drops through to the weekly
    // branch and nobody hears that the date has moved closer. Cleared, it
    // chases on the next run. See scripts/check-action-reminders.ts.
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
  if (Array.isArray(body.assigneeIds)) {
    const ids = [
      ...new Set((body.assigneeIds as unknown[]).map((v) => String(v))),
    ].filter((pid) => people.some((p) => p.id === pid));
    newlyAssigned = ids.filter((pid) => !existing.assigneeIds.includes(pid));
    updates.assigneeIds = ids;
    updates.assigneeNames = ids.map((pid) =>
      displayNameFor(pid, people, users)
    );
  }

  return { updates, newlyAssigned };
}
