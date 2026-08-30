import { readJson, writeJson } from "./controlData";

// Who a reminder goes to. Resolved to actual addresses at send time, not when
// the reminder is created, so a change of custodian or applicant is picked up
// by the reminders already scheduled.
export type ReminderRecipient =
  | "admin"
  | "applicant"
  | "submitter"
  | "custodian";

export type ReminderFrequency =
  | "once"
  | "daily"
  | "weekly"
  | "monthly"
  | "custom";

// A custom interval: "every N days/weeks/months". Lets a reminder be anything
// from every day until approved through to once a month, without being tied to
// a fixed list of choices.
export type ReminderUnit = "day" | "week" | "month";

export interface SpendReminder {
  id: string;
  spendId: string;
  // Denormalised so a cancelled/removed project still reads sensibly in the
  // reminders list. The live project name wins wherever it is available.
  projectName: string;
  recipients: ReminderRecipient[];
  // Date (YYYY-MM-DD) the next send is due. Time of day comes from the cron.
  nextRunAt: string;
  frequency: ReminderFrequency;
  // Day of the month the schedule is anchored to, kept separately because
  // nextRunAt gets clamped in a short month. Without it a monthly reminder set
  // for the 31st would land on 28 February and then stay on the 28th forever.
  anchorDay?: number;
  // Used when frequency is "custom".
  intervalCount?: number;
  intervalUnit?: ReminderUnit;
  note: string;
  // Set on a reminder created alongside an application: it stops itself once
  // the application is approved or declined, so nobody is chased about a
  // decision that has already been made.
  spendStopOnDecision?: boolean;
  // The "approval required by" date, shown in the reminder email.
  approvalRequiredBy?: string;
  active: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  lastRunAt?: string;
  // Why the last run did what it did, including "nobody to send to". A
  // reminder that quietly does nothing is worse than no reminder.
  lastResult?: string;
}

export const RECIPIENT_LABELS: Record<ReminderRecipient, string> = {
  admin: "Admins",
  applicant: "Applicant",
  submitter: "Submitter",
  custodian: "Custodian",
};

export const FREQUENCY_LABELS: Record<ReminderFrequency, string> = {
  once: "Once only",
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
  custom: "Custom interval",
};

export function describeSchedule(r: {
  frequency: ReminderFrequency;
  intervalCount?: number;
  intervalUnit?: ReminderUnit;
}): string {
  if (r.frequency !== "custom") return FREQUENCY_LABELS[r.frequency];
  const n = r.intervalCount || 1;
  const unit = r.intervalUnit || "day";
  return n === 1 ? "Every " + unit : "Every " + n + " " + unit + "s";
}

const REMINDERS_PATH = "spend/reminders.json";
const RUNS_PATH = "spend/reminder-runs.json";

export async function getReminders(): Promise<SpendReminder[]> {
  return readJson<SpendReminder[]>(REMINDERS_PATH, []);
}

export async function saveReminders(list: SpendReminder[]): Promise<void> {
  return writeJson(REMINDERS_PATH, list);
}

export async function createReminder(reminder: SpendReminder): Promise<void> {
  const list = await getReminders();
  list.push(reminder);
  await saveReminders(list);
}

export async function updateReminder(
  id: string,
  updates: Partial<Omit<SpendReminder, "id">>
): Promise<SpendReminder | null> {
  const list = await getReminders();
  const idx = list.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...updates };
  await saveReminders(list);
  return list[idx];
}

export async function deleteReminder(id: string): Promise<boolean> {
  const list = await getReminders();
  const next = list.filter((r) => r.id !== id);
  if (next.length === list.length) return false;
  await saveReminders(next);
  return true;
}

// --- Scheduling ---

// Today in ISO date form. Everything is compared as YYYY-MM-DD strings so a
// reminder due "today" fires regardless of the hour the cron runs.
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function isDue(reminder: SpendReminder, now: Date = new Date()): boolean {
  if (!reminder.active) return false;
  // <= rather than ===, so a reminder is not skipped forever if a run is
  // missed (a failed deploy, a cron outage).
  return reminder.nextRunAt <= todayIso(now);
}

// Adds whole months, clamping to the end of a short month rather than
// overflowing into the next one. Plain setUTCMonth turns 31 January into
// 3 March, which skips February and then drifts every month after it.
// anchorDay keeps a reminder set on the 31st on the 31st of months that have
// one, rather than sticking at the 28th forever.
function addMonths(date: Date, months: number, anchorDay: number): Date {
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)
  );
  const daysInMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(anchorDay, daysInMonth));
  return target;
}

// The next occurrence after one has been sent. A "once" reminder has none and
// is deactivated instead.
export function advance(
  reminder: SpendReminder,
  now: Date = new Date()
): { nextRunAt: string; active: boolean } {
  if (reminder.frequency === "once") {
    return { nextRunAt: reminder.nextRunAt, active: false };
  }
  // Step from the due date, then keep stepping until it is in the future, so a
  // missed run does not leave a daily reminder firing once per catch-up day.
  let date = new Date(`${reminder.nextRunAt}T00:00:00Z`);
  const anchorDay = reminder.anchorDay || date.getUTCDate();
  const today = new Date(`${todayIso(now)}T00:00:00Z`);
  // Normalise every frequency to a count + unit so there is one stepping rule
  // rather than a branch per named frequency.
  const count =
    reminder.frequency === "custom"
      ? Math.max(1, reminder.intervalCount || 1)
      : 1;
  const unit: ReminderUnit =
    reminder.frequency === "custom"
      ? reminder.intervalUnit || "day"
      : reminder.frequency === "daily"
        ? "day"
        : reminder.frequency === "weekly"
          ? "week"
          : "month";

  do {
    if (unit === "day") {
      date.setUTCDate(date.getUTCDate() + count);
    } else if (unit === "week") {
      date.setUTCDate(date.getUTCDate() + 7 * count);
    } else {
      date = addMonths(date, count, anchorDay);
    }
  } while (date <= today);

  return { nextRunAt: date.toISOString().slice(0, 10), active: true };
}

// --- Run log ---

export interface ReminderRun {
  at: string;
  due: number;
  sent: number;
  skipped: number;
  failed: number;
  detail: string[];
}

// Keeps the last 50 runs. Without this a cron that never fires and a cron that
// fires and finds nothing to do look identical.
export async function recordRun(run: ReminderRun): Promise<void> {
  const runs = await readJson<ReminderRun[]>(RUNS_PATH, []);
  runs.unshift(run);
  await writeJson(RUNS_PATH, runs.slice(0, 50));
}

export async function getRuns(): Promise<ReminderRun[]> {
  return readJson<ReminderRun[]>(RUNS_PATH, []);
}
