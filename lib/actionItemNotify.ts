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
import { toldIds } from "./actionItems";
import { resolveActionRecipients, type ActionRecipientContext } from "./actionItemRecipients";
import { sendActionAssignedEmail, sendActionReminderEmail, sendActionRemovedEmail } from "./email";
import { getMinutes } from "./minutesData";

/**
 * Carl: action emails for a meeting go out only once its minutes are SIGNED,
 * batched per person. Until then an action raised from those minutes is
 * HELD: no assignment email, no reminder. Minutes since deleted do not hold
 * anything back (the action lives on in the register).
 */
export async function heldForSigning(item: Pick<ActionItem, "fromMinutes">, cache?: Map<string, boolean>): Promise<boolean> {
  const id = item.fromMinutes?.minutesId;
  if (!id) return false;
  if (cache?.has(id)) return cache.get(id)!;
  const rec = await getMinutes(id);
  const held = !!rec && rec.status !== "signed" && rec.status !== "archived";
  cache?.set(id, held);
  return held;
}

// Resend accepts roughly two messages a second, and a burst comes back as 429s
// that read like bad addresses rather than like rate limiting. Everything here
// goes out one at a time with a breath in between.
export const SEND_GAP_MS = 600;

/** Shared with the room-booking mail queue (lib/roomBookingNotify.ts). */
export function pause(): Promise<void> {
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
    minutesId: item.fromMinutes?.minutesId,
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
  // From minutes not yet signed: told in one email per person at signing.
  // A read that fails holds it too (it is told at signing), never a 500 for
  // an action that has already been saved.
  if (await heldForSigning(item).catch(() => true)) return 0;

  const { resolved } = await resolveActionRecipients(scoped, ["assignees"]);
  const facts = factsFor(item);

  let sent = 0;
  const told: string[] = [];
  for (const person of resolved) {
    const ok = await sendActionAssignedEmail(
      person.email,
      person.name,
      item.raisedByName,
      facts
    );
    if (ok) {
      sent++;
      if (person.personId) told.push(person.personId);
    }
    await pause();
  }
  if (told.length) {
    await updateActionItem(item.id, (cur) => ({
      notifiedIds: [...new Set([...toldIds(cur), ...told])],
    })).catch((err) => console.error("[action-items] told, but could not record it:", item.id, err));
  }
  return sent;
}

/**
 * The action is gone: tell the people who were told about it. Called with the
 * item as it was, AFTER the delete has landed, so a failed delete never sends
 * a "removed" email for an action that is still there.
 */
export async function notifyRemoved(item: ActionItem, removedBy: string): Promise<number> {
  const told = toldIds(item);
  if (told.length === 0 || isClosed(item)) return 0;
  const { resolved } = await resolveActionRecipients({ ...item, assigneeIds: told, assigneeNames: [] }, ["assignees"]);
  let sent = 0;
  for (const person of resolved) {
    if (await sendActionRemovedEmail(person.email, person.name, removedBy, factsFor(item))) sent++;
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
  // The record as it now stands. Handed back so a caller can show the new state
  // instead of re-reading it: the blob can serve the previous copy for a moment
  // after a write, which makes a save that worked look like one that did not.
  item: ActionItem | null;
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
  note = "",
  shared?: ActionRecipientContext
): Promise<ActionChaseResult> {
  // Not stamped: the first reminder must still come once the minutes are signed.
  if (await heldForSigning(item)) {
    return { sent: 0, failed: 0, result: "waiting for the minutes to be signed", item };
  }
  const { resolved, missing, notAllowed = 0 } = await resolveActionRecipients(
    item,
    item.reminder.recipients,
    shared
  );
  const barred = notAllowed > 0 ? `; ${notAllowed} not allowed to read these minutes` : "";

  if (resolved.length === 0) {
    const why = [...missing, ...(notAllowed > 0 ? [`${notAllowed} not allowed to read these minutes`] : [])];
    const result = `nobody to write to (${why.join(", ") || "no recipients chosen"})`;
    // The date is still stamped. Without it a due action with no addresses is
    // retried on every run forever, and the log fills with the same failure.
    const saved = await updateActionItem(item.id, {
      lastRemindedOn: todayIso(now),
      lastReminderResult: result,
    });
    return { sent: 0, failed: 0, result, item: saved };
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
    (missing.length > 0
      ? `sent to ${sent} of ${resolved.length}; no address for: ${missing.join(", ")}`
      : `sent to ${sent} of ${resolved.length}`) + barred;

  // 🔴 The emails have gone. A failure to save the result must not throw:
  // callers would read that as "nothing went out", hand the day back and
  // send everybody the same chase again.
  try {
    const saved = await updateActionItem(item.id, {
      lastRemindedOn: todayIso(now),
      lastReminderResult: result,
    });
    return { sent, failed, result, item: saved };
  } catch (err) {
    console.error("[action-items] chase sent but its result could not be saved:", item.id, err);
    return { sent, failed, result: `${result} (the emails went out, but this result could not be saved: do not send it again)`, item: null };
  }
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
