import {
  ACTION_CATEGORIES,
  STATUS_LABELS,
  parseReminder,
} from "./actionItems";
import type {
  ActionItem,
  ActionPriority,
  ActionStatus,
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

// Turns an edit payload into the fields to write.
//
// Shared by the single PATCH and the bulk endpoint so the two cannot drift on
// what a valid edit is - the sort of split where one route validates an ETA and
// the other quietly stores rubbish.
export function parseActionEdit(
  body: Record<string, unknown>,
  existing: ActionItem,
  people: Person[],
  users: User[]
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
  if (
    typeof body.category === "string" &&
    ACTION_CATEGORIES.includes(body.category)
  ) {
    updates.category = body.category;
  }
  if (VALID_PRIORITIES.includes(body.priority as ActionPriority)) {
    updates.priority = body.priority as ActionPriority;
  }
  if (VALID_STATUSES.includes(body.status as ActionStatus)) {
    updates.status = body.status as ActionStatus;
  }
  if (body.progress !== undefined) {
    updates.progress = Number(body.progress);
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
