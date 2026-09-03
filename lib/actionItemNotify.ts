import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  daysUntilDue,
  isClosed,
  nextReminderOn,
  todayIso,
  updateActionItem,
} from "./actionItemData";
import type { ActionItem } from "./actionItemData";
import { resolveActionRecipients } from "./actionItemRecipients";
import { sendActionAssignedEmail, sendActionReminderEmail } from "./email";

// Resend accepts roughly two messages a second, and a burst comes back as 429s
// that read like bad addresses rather than like rate limiting. Everything here
// goes out one at a time with a breath in between.
const SEND_GAP_MS = 600;

function pause(): Promise<void> {
  return new Promise((r) => setTimeout(r, SEND_GAP_MS));
}

// The facts every action email shows, built once so the assignment mail and the
// chase cannot describe the same action differently.
function factsFor(item: ActionItem, now = new Date()) {
  return {
    ref: item.ref,
    title: item.title,
    description: item.description,
    dueDate: item.dueDate,
    daysLeft: daysUntilDue(item, now),
    progress: item.progress,
    statusLabel: STATUS_LABELS[item.status],
    assignedTo: item.assigneeNames.filter(Boolean).join(", "),
    priorityLabel: PRIORITY_LABELS[item.priority],
  };
}

// Told the day they are given the work, rather than leaving first contact to be
// a chase three days before it is due.
//
// `onlyPersonIds` narrows it to the people newly added by an edit, so changing
// an ETA does not re-mail everybody already carrying the action.
export async function notifyAssignees(
  item: ActionItem,
  onlyPersonIds?: string[]
): Promise<number> {
  const scoped: ActionItem = onlyPersonIds
    ? {
        ...item,
        assigneeIds: item.assigneeIds.filter((id) => onlyPersonIds.includes(id)),
      }
    : item;
  if (scoped.assigneeIds.length === 0) return 0;

  const { resolved } = await resolveActionRecipients(scoped, ["assignees"]);
  const facts = factsFor(item);

  let sent = 0;
  for (const person of resolved) {
    const ok = await sendActionAssignedEmail(
      person.email,
      person.name,
      item.raisedByName,
      facts
    );
    if (ok) sent++;
    await pause();
  }
  return sent;
}

export interface ActionChaseResult {
  sent: number;
  failed: number;
  // What happened, in the words the run log and the grid both show. A reminder
  // that quietly does nothing is worse than no reminder.
  result: string;
}

// Which of the three chases this is. Said plainly in the mail so the same
// action arriving twice in a week is never mistaken for a duplicate.
function whyNow(item: ActionItem, now: Date): string {
  const days = daysUntilDue(item, now);
  if (days === null) return "This is a reminder about an action assigned to you.";
  if (days > 0) {
    return `This action is due in ${days} day${days === 1 ? "" : "s"}.`;
  }
  if (days === 0) return "This action is due today.";
  const late = Math.abs(days);
  return `This action was due ${late} day${late === 1 ? "" : "s"} ago and is still open.`;
}

// Sends one action's chase and records what happened on the item itself.
//
// Used by the daily cron and by "Remind now" on the grid, so a manual nudge and
// a scheduled one leave the same trail and reset the same clock.
export async function chaseActionItem(
  item: ActionItem,
  now: Date = new Date(),
  note = ""
): Promise<ActionChaseResult> {
  const { resolved, missing } = await resolveActionRecipients(
    item,
    item.reminder.recipients
  );

  if (resolved.length === 0) {
    const result = `nobody to write to (${missing.join(", ") || "no recipients chosen"})`;
    // The date is still stamped. Without it a due action with no addresses is
    // retried on every run forever, and the log fills with the same failure.
    await updateActionItem(item.id, {
      lastRemindedOn: todayIso(now),
      lastReminderResult: result,
    });
    return { sent: 0, failed: 0, result };
  }

  const facts = factsFor(item, now);
  const why = whyNow(item, now);

  let sent = 0;
  let failed = 0;
  for (const person of resolved) {
    const ok = await sendActionReminderEmail(
      person.email,
      person.name,
      person.role,
      why,
      facts,
      note
    );
    if (ok) sent++;
    else failed++;
    await pause();
  }

  const result =
    missing.length > 0
      ? `sent to ${sent} of ${resolved.length}; no address for: ${missing.join(", ")}`
      : `sent to ${sent} of ${resolved.length}`;

  await updateActionItem(item.id, {
    lastRemindedOn: todayIso(now),
    lastReminderResult: result,
  });

  return { sent, failed, result };
}

// Everything the daily run should chase today. Exported so the cron reads as a
// list of decisions rather than a loop full of date arithmetic.
export function actionsDueForChase(
  items: ActionItem[],
  now: Date = new Date()
): ActionItem[] {
  const today = todayIso(now);
  return items.filter((item) => {
    if (isClosed(item)) return false;
    const next = nextReminderOn(item);
    return next !== null && next <= today;
  });
}
