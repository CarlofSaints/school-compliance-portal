// ---------------------------------------------------------------------------
// The weekly SGB update: one email to every user of the portal, with the
// headline numbers a governor would otherwise have to log in to find.
//
// Pure. No storage, no email. The settings file, the facts and the "is it due
// today" decision all live here so scripts/check-weekly-update.ts can prove the
// schedule with nothing running.
// ---------------------------------------------------------------------------

import type { ActionItem } from "./actionItems";
import { summarise, isClosed, isOverdue, todayIso, addDays, daysBetween, daysUntilDue } from "./actionItems";
import type { MinutesRecord } from "./minutesData";
import { signingProgress, formatPeriod } from "./minutes";
import type { SpendApplication } from "./spend";
import { evaluateProgress } from "./approvalEngine";

export interface WeeklyUpdateSettings {
  /** Off until somebody turns it on. An email to every governor is not a
   *  thing that should start by itself on the day the code ships. */
  enabled: boolean;
  /** 0 = Sunday ... 6 = Saturday. Sent on the 07:00 run of that day. */
  weekday: number;
  /** "Hurlyvale" in "Good day, Hurlyvale team". Blank = derived from the
   *  school's full name. */
  teamName: string;
  /** YYYY-MM-DD the schedule was switched on. A school that turns it on on a
   *  Wednesday for Mondays must not get a "catch-up" send on Thursday. */
  enabledOn?: string;
  /** YYYY-MM-DD of the last send to everyone, scheduled or by hand. */
  lastSentOn?: string;
  /** What that send did, in words, for the admin screen. */
  lastResult?: string;
}

export const DEFAULT_WEEKLY_UPDATE: WeeklyUpdateSettings = {
  enabled: false,
  weekday: 1,
  teamName: "",
};

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** A missed run may still send this many days late. Beyond that the numbers
 *  are nearly a week old and the next proper send is closer than the old one. */
export const CATCH_UP_DAYS = 2;

export function parseWeeklyUpdate(input: unknown): WeeklyUpdateSettings {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const weekday = Number(o.weekday);
  const iso = (v: unknown) =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
  return {
    enabled: o.enabled === true,
    weekday: Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : 1,
    teamName: typeof o.teamName === "string" ? o.teamName.trim().slice(0, 60) : "",
    enabledOn: iso(o.enabledOn),
    lastSentOn: iso(o.lastSentOn),
    lastResult: typeof o.lastResult === "string" ? o.lastResult : undefined,
  };
}

/** "Hurlyvale Primary School" -> "Hurlyvale", "Jeppe Girls High" -> "Jeppe
 *  Girls". What people call the school, not what is on the letterhead. */
export function defaultTeamName(fullName: string): string {
  const trimmed = fullName
    .replace(
      /\s+(primary|preparatory|prep|high|secondary|junior|senior|combined|college|academy)?\s*(school)?\s*$/i,
      ""
    )
    .trim();
  // "High School" alone would strip to "High": nothing left that names it.
  if (!trimmed || /^(primary|preparatory|prep|high|secondary|junior|senior|combined|college|academy|school)$/i.test(trimmed)) {
    return fullName.trim();
  }
  return trimmed;
}

export function teamNameFor(settings: WeeklyUpdateSettings, fullName: string): string {
  return settings.teamName || defaultTeamName(fullName);
}

/** The most recent `weekday` on or before `today` (both YYYY-MM-DD). */
export function lastOccurrence(today: string, weekday: number): string {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  return addDays(today, -((dow - weekday + 7) % 7));
}

/**
 * Whether the daily run should send the weekly update today.
 *
 * Derived, never stored, the same way action reminders are: due is "the send
 * day has come and nothing has gone out since", so a cron that misses Monday
 * sends on Tuesday rather than skipping a week. Capped at CATCH_UP_DAYS.
 */
export function weeklyUpdateDue(
  settings: WeeklyUpdateSettings,
  now: Date = new Date()
): boolean {
  if (!settings.enabled) return false;
  const today = todayIso(now);
  const sendDay = lastOccurrence(today, settings.weekday);
  if (daysBetween(sendDay, today) > CATCH_UP_DAYS) return false;
  if (settings.enabledOn && sendDay < settings.enabledOn) return false;
  if (settings.lastSentOn && settings.lastSentOn >= sendDay) return false;
  return true;
}

/** The next date the schedule will send, for the admin screen. */
export function nextSendOn(
  settings: WeeklyUpdateSettings,
  now: Date = new Date()
): string | null {
  if (!settings.enabled) return null;
  if (weeklyUpdateDue(settings, now)) return todayIso(now);
  const today = todayIso(now);
  for (let i = 1; i <= 7; i++) {
    const d = addDays(today, i);
    if (new Date(`${d}T00:00:00Z`).getUTCDay() === settings.weekday) return d;
  }
  return null;
}

// --- The facts in the email ---------------------------------------------------

export interface WeeklyActionLine {
  ref: string;
  title: string;
  owners: string;
  due: string;
  daysLate: number;
}

export interface WeeklyMinutesLine {
  title: string;
  period: string;
  signed: number;
  total: number;
  waitingOn: string[];
}

export interface WeeklySpendLine {
  project: string;
  amount: number;
  approved: number;
  total: number;
  waitingOn: string[];
  /** Nobody was named to approve it, so it cannot move on its own. */
  noApprovers: boolean;
}

export interface WeeklySpend {
  /** Submitted, not yet decided. */
  awaiting: number;
  awaitingValue: number;
  /** Approved and not yet marked complete. */
  approved: number;
  approvedValue: number;
  /** Sent back to the applicant. */
  changes: number;
  completed: number;
  /** Largest first. Capped when drawn, never when counted. */
  awaitingList: WeeklySpendLine[];
}

export interface WeeklyFacts {
  actions: {
    open: number;
    overdue: number;
    dueThisWeek: number;
    /** Most late first. Capped when drawn, never when counted. */
    overdueList: WeeklyActionLine[];
  };
  accounts: {
    total: number;
    notActivated: number;
  };
  minutes: WeeklyMinutesLine[];
  spend: WeeklySpend;
}

export function buildWeeklySpend(apps: SpendApplication[]): WeeklySpend {
  // "Logged only" bands need nobody's approval, so they are never waiting.
  const waiting = apps.filter(
    (a) => (a.status === "pending" || a.status === "pending_decision") && !a.approvalLogOnly
  );
  const approved = apps.filter((a) => a.status === "approved");
  const sum = (list: SpendApplication[], pick: (a: SpendApplication) => number) =>
    list.reduce((n, a) => n + (Number(pick(a)) || 0), 0);
  return {
    awaiting: waiting.length,
    awaitingValue: sum(waiting, (a) => a.estimatedAmount),
    approved: approved.length,
    approvedValue: sum(approved, (a) => a.approvedAmount ?? a.estimatedAmount),
    changes: apps.filter((a) => a.status === "requires_changes").length,
    completed: apps.filter((a) => a.status === "completed").length,
    awaitingList: waiting
      .map((a) => {
        const p = evaluateProgress(a);
        return {
          project: a.projectName,
          amount: Number(a.estimatedAmount) || 0,
          approved: p.approved,
          total: p.total,
          waitingOn: p.outstanding.map((o) => o.name),
          noApprovers: (a.requiredApprovers || []).length === 0,
        };
      })
      .sort((x, y) => y.amount - x.amount),
  };
}

export interface AccountLike {
  forcePasswordChange: boolean;
}

export function buildWeeklyFacts(
  actions: ActionItem[],
  users: AccountLike[],
  minutes: MinutesRecord[],
  spend: SpendApplication[],
  now: Date = new Date()
): WeeklyFacts {
  const s = summarise(actions, now);
  const overdueList = actions
    .filter((a) => isOverdue(a, now))
    .map((a) => ({
      ref: a.ref,
      title: a.title,
      owners: a.assigneeNames.join(", ") || "Nobody assigned",
      due: a.dueDate,
      daysLate: -(daysUntilDue(a, now) ?? 0),
    }))
    .sort((a, b) => b.daysLate - a.daysLate);

  const unsigned = minutes
    .filter((m) => m.status === "awaiting_signatures")
    .map((m) => {
      const p = signingProgress(m.signatories || []);
      return {
        title: m.title,
        period: formatPeriod(m.period),
        signed: p.signed,
        total: p.total,
        waitingOn: p.waitingOn,
      };
    });

  return {
    actions: {
      open: actions.filter((a) => !isClosed(a)).length,
      overdue: s.overdue,
      dueThisWeek: s.dueThisWeek,
      overdueList,
    },
    accounts: {
      total: users.length,
      // The portal has no "last signed in" date. Somebody still on the
      // temporary password they were issued has never finished signing in,
      // which is the thing this card is asking about.
      notActivated: users.filter((u) => u.forcePasswordChange).length,
    },
    minutes: unsigned,
    spend: buildWeeklySpend(spend),
  };
}
