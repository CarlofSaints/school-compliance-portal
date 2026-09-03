import { GOVERNANCE_LABEL } from "./positions";

// ---------------------------------------------------------------------------
// Action items: the register of who agreed to do what, by when.
//
// An SGB meeting produces actions. Until now they lived in the minutes, which
// nobody re-reads, so the register exists to put them on one grid with an owner,
// a date and a progress figure - and to chase them by email without anybody
// having to remember to.
//
// This half is PURE: types, labels, date arithmetic and the reminder schedule,
// with no storage in it. The grid is a client component, and lib/controlData
// pulls in @vercel/blob, so anything the browser needs has to live here rather
// than in actionItemData. See lib/actionItemData.ts for the store.
// ---------------------------------------------------------------------------

export type ActionStatus =
  | "not_started"
  | "in_progress"
  | "blocked"
  | "done"
  | "cancelled";

export type ActionPriority = "low" | "medium" | "high";

// Who a reminder goes to. Resolved to addresses at SEND time, never stored, so
// a change of assignee is picked up by reminders already scheduled.
export type ActionRecipient = "assignees" | "admins" | "raiser";

export const STATUS_LABELS: Record<ActionStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

// Worst first, so what needs attention sorts to the top of the grid.
export const STATUS_RANK: Record<ActionStatus, number> = {
  blocked: 0,
  not_started: 1,
  in_progress: 2,
  done: 3,
  cancelled: 4,
};

export const STATUS_PILL: Record<ActionStatus, string> = {
  blocked: "bg-red-100 text-red-700",
  not_started: "bg-gray-100 text-gray-600",
  in_progress: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-400",
};

export const PRIORITY_LABELS: Record<ActionPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const PRIORITY_RANK: Record<ActionPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export const PRIORITY_PILL: Record<ActionPriority, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-gray-100 text-gray-600",
};

export const RECIPIENT_LABELS: Record<ActionRecipient, string> = {
  assignees: "The people assigned",
  admins: `${GOVERNANCE_LABEL} admins`,
  raiser: "Whoever raised it",
};

export const ALL_RECIPIENTS: ActionRecipient[] = [
  "assignees",
  "admins",
  "raiser",
];

// Free text would fragment into "Finance", "finance" and "Finances", which is
// what makes a filter useless. Fixed list, editable here.
export const ACTION_CATEGORIES = [
  "Governance",
  "Finance",
  "Policy",
  "Compliance",
  "Infrastructure",
  "Fundraising",
  "Staffing",
  "Health & Safety",
  "Other",
];

// An item in one of these is finished: it is never chased, and it drops out of
// the open counts.
export const CLOSED_STATUSES: ActionStatus[] = ["done", "cancelled"];

export function isClosed(item: { status: ActionStatus }): boolean {
  return CLOSED_STATUSES.includes(item.status);
}

export interface ActionReminderSettings {
  enabled: boolean;
  // A heads-up this many days before the ETA. 0 means the first chase is on the
  // day itself.
  daysBefore: number;
  // Keep chasing every N days once it is overdue. 0 means chase once, on the
  // ETA, and then leave it alone.
  repeatEveryDays: number;
  recipients: ActionRecipient[];
}

export const DEFAULT_REMINDER: ActionReminderSettings = {
  enabled: true,
  daysBefore: 3,
  repeatEveryDays: 7,
  recipients: ["assignees"],
};

export interface ActionUpdate {
  id: string;
  at: string;
  byId: string;
  byName: string;
  note: string;
  // The progress figure as it stood AFTER this update, so the log reads as a
  // history rather than a set of disconnected notes.
  progress: number;
  status: ActionStatus;
}

export interface ActionItem {
  id: string;
  // Human reference ("A-014") for the minutes. Never reused - see nextRef.
  ref: string;
  title: string;
  description: string;
  // People ids from the governance register (lib/peopleData). A person there
  // may or may not have a portal login; the email is resolved either way.
  assigneeIds: string[];
  // Denormalised names, so an item still reads sensibly if somebody is removed
  // from the register. The live register wins wherever it can be resolved.
  assigneeNames: string[];
  category: string;
  priority: ActionPriority;
  // The ETA. Optional: an action with no date is still worth recording, it just
  // cannot be chased.
  dueDate: string;
  status: ActionStatus;
  progress: number;
  updates: ActionUpdate[];
  reminder: ActionReminderSettings;
  // YYYY-MM-DD of the last chase that actually left the server, and why the
  // last run did what it did. A reminder that quietly does nothing is worse
  // than no reminder.
  lastRemindedOn?: string;
  lastReminderResult?: string;
  // Where the action came from - the meeting that agreed it.
  meetingDate?: string;
  raisedById: string;
  raisedByName: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export function formatRef(n: number): string {
  return `A-${String(n).padStart(3, "0")}`;
}

// --- Invariants -------------------------------------------------------------

// Progress and status are two readings of one thing, so they can disagree. This
// is the ONE place the rules live; every write path goes through it rather than
// each route growing its own idea of what "done" means.
//
//   - done      -> 100%, always. A done action at 80% is a contradiction.
//   - cancelled -> progress is left alone; it is not a completion figure.
//   - anything else at 100% is allowed and shown as "awaiting sign-off": work
//     can be finished before the SGB has accepted it.
export function normalise(item: ActionItem): ActionItem {
  const progress = Math.max(0, Math.min(100, Math.round(item.progress || 0)));
  const next: ActionItem = { ...item, progress };
  if (next.status === "done") {
    next.progress = 100;
    next.completedAt = next.completedAt || new Date().toISOString();
  } else {
    // Reopening clears the completion stamp, otherwise a reopened action still
    // reports a date it was finished.
    delete next.completedAt;
  }
  if (next.status === "not_started" && progress > 0) {
    next.status = "in_progress";
  }
  return next;
}

// Reminder settings arriving from a form, clamped to something sane. Lives with
// the type so the create and edit endpoints cannot drift apart on what a valid
// schedule is.
export function parseReminder(input: unknown): ActionReminderSettings {
  const raw = (input || {}) as Partial<ActionReminderSettings>;
  const recipients = Array.isArray(raw.recipients)
    ? raw.recipients.filter((r) => ALL_RECIPIENTS.includes(r))
    : DEFAULT_REMINDER.recipients;
  const num = (value: unknown, fallback: number, max: number): number => {
    const n = Math.round(Number(value ?? fallback));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(max, n));
  };
  return {
    enabled: raw.enabled !== false,
    // Capped so a typo cannot schedule a heads-up two years out.
    daysBefore: num(raw.daysBefore, DEFAULT_REMINDER.daysBefore, 60),
    repeatEveryDays: num(
      raw.repeatEveryDays,
      DEFAULT_REMINDER.repeatEveryDays,
      90
    ),
    recipients: recipients.length > 0 ? recipients : DEFAULT_REMINDER.recipients,
  };
}

// --- Dates ------------------------------------------------------------------

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

// Negative when the ETA has passed. null when there is no ETA to count to -
// which is NOT the same as zero, and must not render as "due today".
export function daysUntilDue(
  item: { dueDate: string },
  now: Date = new Date()
): number | null {
  if (!item.dueDate) return null;
  return daysBetween(todayIso(now), item.dueDate);
}

export function isOverdue(item: ActionItem, now: Date = new Date()): boolean {
  if (isClosed(item) || !item.dueDate) return false;
  return item.dueDate < todayIso(now);
}

// How the ETA reads on the grid and in an email. Deliberately plain: "3 days
// late" is a fact somebody can act on, "action required" is not.
export function duePhrase(dueDate: string, daysLeft: number | null): string {
  if (!dueDate) return "No date set";
  if (daysLeft === null) return dueDate;
  if (daysLeft === 0) return "Today";
  if (daysLeft > 0) return `${daysLeft} day${daysLeft === 1 ? "" : "s"} to go`;
  const late = Math.abs(daysLeft);
  return `${late} day${late === 1 ? "" : "s"} late`;
}

// --- Reminder scheduling ----------------------------------------------------

// The date the next chase is due, derived rather than stored.
//
// Storing a nextRunAt would go stale the moment somebody moved the ETA, and a
// reminder that fires against last month's date is worse than none. Deriving it
// also means the grid can show the same answer the cron will act on.
//
// The sequence for one action is: a heads-up (dueDate - daysBefore), a nudge on
// the day, then a chase every repeatEveryDays while it stays open.
export function nextReminderOn(item: ActionItem): string | null {
  if (!item.reminder?.enabled) return null;
  if (isClosed(item)) return null;
  if (!item.dueDate) return null;
  if (!item.reminder.recipients?.length) return null;

  const first = addDays(item.dueDate, -Math.max(0, item.reminder.daysBefore));
  const last = item.lastRemindedOn;

  if (!last || last < first) return first;
  if (last < item.dueDate) return item.dueDate;

  const repeat = Math.max(0, item.reminder.repeatEveryDays);
  if (repeat === 0) return null;
  return addDays(last, repeat);
}

// <= rather than ===, so a chase missed to a cron outage or a failed deploy
// goes out on the next run instead of being skipped forever.
export function reminderDue(item: ActionItem, now: Date = new Date()): boolean {
  const next = nextReminderOn(item);
  return next !== null && next <= todayIso(now);
}

// --- Summary ----------------------------------------------------------------

export interface ActionSummary {
  total: number;
  open: number;
  overdue: number;
  dueThisWeek: number;
  done: number;
  blocked: number;
}

export function summarise(
  items: ActionItem[],
  now: Date = new Date()
): ActionSummary {
  const today = todayIso(now);
  const weekOut = addDays(today, 7);
  return {
    total: items.length,
    open: items.filter((i) => !isClosed(i)).length,
    overdue: items.filter((i) => isOverdue(i, now)).length,
    dueThisWeek: items.filter(
      (i) =>
        !isClosed(i) && i.dueDate && i.dueDate >= today && i.dueDate <= weekOut
    ).length,
    done: items.filter((i) => i.status === "done").length,
    blocked: items.filter((i) => i.status === "blocked").length,
  };
}
