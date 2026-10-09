// ---------------------------------------------------------------------------
// The action items summary: a scheduled email carrying the whole open register
// as a colour-coded Excel workbook.
//
// The weekly SGB update says "12 open, 3 overdue". This is the one somebody
// can work from: every open action with its owner, ETA, progress and latest
// note, to filter, print or take into a meeting.
//
// Pure. No storage, no email, no Excel. The settings, the "is it due today"
// decision and the rows the workbook is drawn from all live here, so
// scripts/check-action-summary.ts can prove them with nothing running.
// ---------------------------------------------------------------------------

import type { ActionItem } from "./actionItems";
import { lastOccurrence } from "./weeklyUpdate";
import {
  isClosed,
  todayIso,
  addDays,
  daysBetween,
  daysUntilDue,
  STATUS_LABELS,
  STATUS_RANK,
  PRIORITY_LABELS,
} from "./actionItems";

export type SummaryFrequency = "weekdays" | "weekly" | "fortnightly" | "monthly";

export const FREQUENCY_LABELS: Record<SummaryFrequency, string> = {
  weekdays: "Every weekday (Monday to Friday)",
  weekly: "Once a week",
  fortnightly: "Every two weeks",
  monthly: "Once a month",
};

export const ALL_FREQUENCIES: SummaryFrequency[] = ["weekdays", "weekly", "fortnightly", "monthly"];

export interface ActionSummarySettings {
  /** Off until somebody turns it on. */
  enabled: boolean;
  frequency: SummaryFrequency;
  /** 0 = Sunday ... 6 = Saturday. For weekly and fortnightly. */
  weekday: number;
  /** 1-28 for monthly. Capped at 28 so every month has the day. */
  dayOfMonth: number;
  /** Portal users picked by name. */
  userIds: string[];
  /** Everyone carrying these tags, users and people alike, resolved at send
   *  time so a new committee member is on the next run without anybody
   *  remembering to add them here. */
  tagIds: string[];
  /** Addresses with no account at all, typed by hand. */
  extraEmails: string[];
  /** An ETA this many days away or closer is "due soon" (orange). */
  dueSoonDays: number;
  /** YYYY-MM-DD the schedule was switched on. Also the anchor that decides
   *  which weeks a fortnightly send falls in. */
  enabledOn?: string;
  /** YYYY-MM-DD of the last send to the list, scheduled or by hand. */
  lastSentOn?: string;
  /** What that send did, in words, for the admin screen. */
  lastResult?: string;
}

export const DEFAULT_ACTION_SUMMARY: ActionSummarySettings = {
  enabled: false,
  frequency: "weekly",
  weekday: 1,
  dayOfMonth: 1,
  userIds: [],
  tagIds: [],
  extraEmails: [],
  dueSoonDays: 7,
};

/** A missed weekly, fortnightly or monthly run may still send this many days
 *  late. A weekday send never catches up: tomorrow's is the catch-up. */
export const SUMMARY_CATCH_UP_DAYS = 2;

const iso = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;

const stringList = (v: unknown, max: number, lower = false): string[] =>
  Array.isArray(v)
    ? [
        ...new Set(
          v
            .filter((x): x is string => typeof x === "string")
            .map((x) => (lower ? x.trim().toLowerCase() : x.trim()))
            .filter(Boolean)
        ),
      ].slice(0, max)
    : [];

export function parseActionSummary(input: unknown): ActionSummarySettings {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const int = (v: unknown, fallback: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
  };
  const frequency = ALL_FREQUENCIES.includes(o.frequency as SummaryFrequency)
    ? (o.frequency as SummaryFrequency)
    : DEFAULT_ACTION_SUMMARY.frequency;
  return {
    enabled: o.enabled === true,
    frequency,
    weekday: int(o.weekday, DEFAULT_ACTION_SUMMARY.weekday, 0, 6),
    dayOfMonth: int(o.dayOfMonth, DEFAULT_ACTION_SUMMARY.dayOfMonth, 1, 28),
    userIds: stringList(o.userIds, 500),
    tagIds: stringList(o.tagIds, 100),
    // Lower-cased so the same address typed twice is one recipient. Validity
    // is checked where it is used, against the shared rule.
    extraEmails: stringList(o.extraEmails, 100, true),
    dueSoonDays: int(o.dueSoonDays, DEFAULT_ACTION_SUMMARY.dueSoonDays, 1, 60),
    enabledOn: iso(o.enabledOn),
    lastSentOn: iso(o.lastSentOn),
    lastResult: typeof o.lastResult === "string" ? o.lastResult : undefined,
  };
}

// --- Schedule ------------------------------------------------------------------

/**
 * "Now" as a clock in South Africa reads it (UTC+2, no daylight saving).
 *
 * The rest of the portal dates things in UTC, which is harmless at the 07:00
 * cron (05:00 UTC, same date). But "Send to the list now" pressed at 00:30 on
 * a Monday is still Sunday in UTC: it would be stamped as Sunday's send, and
 * the 07:00 run would email everybody a second time.
 */
export function schoolNow(now: Date = new Date()): Date {
  return new Date(now.getTime() + 2 * 3600 * 1000);
}

export function schoolToday(now: Date = new Date()): string {
  return todayIso(schoolNow(now));
}

/** True when a save changes WHEN it sends. Such a save restamps enabledOn,
 *  or moving a Wednesday schedule to Monday on a Tuesday would count Monday
 *  as missed and "catch it up" the morning after the last send. */
export function scheduleChanged(a: ActionSummarySettings, b: ActionSummarySettings): boolean {
  return a.frequency !== b.frequency || a.weekday !== b.weekday || a.dayOfMonth !== b.dayOfMonth;
}

const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

/** The first `weekday` on or after `from`. */
function firstWeekdayFrom(from: string, weekday: number): string {
  return addDays(from, (weekday - dow(from) + 7) % 7);
}

/**
 * The most recent day ON OR BEFORE today the schedule says to send, or null
 * when there has not been one yet.
 *
 * Fortnightly counts in steps of 14 days from the first chosen weekday on or
 * after the day it was switched on, so "every second Monday" means the same
 * Mondays for as long as it stays on.
 */
export function lastScheduledOn(s: ActionSummarySettings, today: string): string | null {
  switch (s.frequency) {
    case "weekdays": {
      const d = dow(today);
      return d >= 1 && d <= 5 ? today : null;
    }
    case "weekly":
      return lastOccurrence(today, s.weekday);
    case "fortnightly": {
      const anchor = firstWeekdayFrom(s.enabledOn || today, s.weekday);
      const last = lastOccurrence(today, s.weekday);
      if (last < anchor) return null;
      return daysBetween(anchor, last) % 14 === 0 ? last : addDays(last, -7);
    }
    case "monthly": {
      const [y, m, day] = today.split("-").map(Number);
      const thisMonth = `${y}-${String(m).padStart(2, "0")}-${String(s.dayOfMonth).padStart(2, "0")}`;
      if (day >= s.dayOfMonth) return thisMonth;
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return `${py}-${String(pm).padStart(2, "0")}-${String(s.dayOfMonth).padStart(2, "0")}`;
    }
  }
}

/**
 * Whether today's 07:00 run should send the summary.
 *
 * Derived, never stored, like every other schedule in the portal: due is "a
 * send day has come and nothing has gone out since".
 *
 * 🔴 A send day must be AFTER the day it was switched on, not on it. The cron
 * runs at 07:00 and people switch things on during the day, so ">=" would
 * mean switching it on at 10:00 on a Monday sends a "catch-up" on Tuesday
 * morning. "Send it now" is the button for wanting one today.
 */
export function actionSummaryDue(s: ActionSummarySettings, now: Date = new Date()): boolean {
  if (!s.enabled) return false;
  const today = schoolToday(now);
  const sendDay = lastScheduledOn(s, today);
  if (!sendDay) return false;
  const lateBy = daysBetween(sendDay, today);
  if (lateBy > (s.frequency === "weekdays" ? 0 : SUMMARY_CATCH_UP_DAYS)) return false;
  if (s.enabledOn && sendDay <= s.enabledOn) return false;
  if (s.lastSentOn && s.lastSentOn >= sendDay) return false;
  return true;
}

/** The next date the schedule will send, for the admin screen. */
export function nextSummaryOn(s: ActionSummarySettings, now: Date = new Date()): string | null {
  if (!s.enabled) return null;
  if (actionSummaryDue(s, now)) return schoolToday(now);
  const today = schoolToday(now);
  for (let i = 1; i <= 62; i++) {
    const d = addDays(today, i);
    if (lastScheduledOn(s, d) === d && (!s.enabledOn || d > s.enabledOn)) return d;
  }
  return null;
}

/** "Every Monday", "Every second Monday", "On the 1st of every month". */
export function describeSchedule(s: ActionSummarySettings, weekdayLabels: string[]): string {
  switch (s.frequency) {
    case "weekdays":
      return "Every weekday at 07:00";
    case "weekly":
      return `Every ${weekdayLabels[s.weekday]} at 07:00`;
    case "fortnightly":
      return `Every second ${weekdayLabels[s.weekday]} at 07:00`;
    case "monthly":
      return `On the ${ordinal(s.dayOfMonth)} of every month at 07:00`;
  }
}

export function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] || "th"}`;
}

// --- The rows ----------------------------------------------------------------

/** How the ETA stands. Also the colour of the row. */
export type SummaryHealth = "overdue" | "due_soon" | "on_track" | "no_date";

export const HEALTH_LABELS: Record<SummaryHealth, string> = {
  overdue: "Overdue",
  due_soon: "Due soon",
  on_track: "On track",
  no_date: "No ETA",
};

export interface SummaryRow {
  ref: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  /** Raw status, so the workbook can colour it. */
  statusKey: ActionItem["status"];
  priorityKey: ActionItem["priority"];
  /** 0-100 */
  progress: number;
  owners: string;
  /** The same people as a list. Never split `owners` on commas: a name can
   *  carry one ("Smith, J"). */
  ownerList: string[];
  /** YYYY-MM-DD or "" */
  dueDate: string;
  /** Negative when late, null when there is no ETA. */
  daysLeft: number | null;
  health: SummaryHealth;
  latestNote: string;
  latestNoteBy: string;
  /** YYYY-MM-DD of the latest update, or "" */
  latestNoteOn: string;
  raisedBy: string;
  /** YYYY-MM-DD */
  raisedOn: string;
  /** "SGB meeting (March 2026)" or the meeting date, or "" */
  fromMeeting: string;
  /** Origin and carriers, so a recipient who may not read those minutes gets
   *  a copy without this row (lib/minutesAccess.ts actionVisible). Not shown. */
  fromMinutesId?: string;
  assigneeIds?: string[];
}

export function healthOf(
  dueDate: string,
  daysLeft: number | null,
  dueSoonDays: number
): SummaryHealth {
  if (!dueDate || daysLeft === null) return "no_date";
  if (daysLeft < 0) return "overdue";
  if (daysLeft <= dueSoonDays) return "due_soon";
  return "on_track";
}

const HEALTH_ORDER: Record<SummaryHealth, number> = {
  overdue: 0,
  due_soon: 1,
  on_track: 2,
  no_date: 3,
};

/**
 * Every OPEN action, worst first: overdue (most late first), then due soon,
 * then on track by ETA, then the undated ones. Blocked sorts first within a
 * group, the same as on the grid.
 *
 * `ownerNames` maps an item id to its owners as the register names them
 * today; the names stored on the item are the fallback.
 */
export function buildSummaryRows(
  items: ActionItem[],
  dueSoonDays: number,
  now: Date = new Date(),
  ownerNames?: Map<string, string[]>
): SummaryRow[] {
  return items
    .filter((i) => !isClosed(i))
    .map((i): SummaryRow => {
      const daysLeft = daysUntilDue(i, now);
      const latest = [...(i.updates || [])].sort((a, b) => (a.at < b.at ? 1 : -1))[0];
      const names = ownerNames?.get(i.id) ?? i.assigneeNames;
      const fromMeeting = i.fromMinutes
        ? [i.fromMinutes.minutesTitle, i.fromMinutes.minutesPeriod && `(${i.fromMinutes.minutesPeriod})`]
            .filter(Boolean)
            .join(" ")
        : i.meetingDate || "";
      return {
        ref: i.ref,
        title: i.title,
        description: i.description || "",
        category: i.category || "",
        priority: PRIORITY_LABELS[i.priority] || i.priority,
        priorityKey: i.priority,
        status: STATUS_LABELS[i.status] || i.status,
        statusKey: i.status,
        progress: Math.max(0, Math.min(100, Math.round(i.progress || 0))),
        owners: names.filter(Boolean).join(", "),
        ownerList: names.filter(Boolean),
        dueDate: i.dueDate || "",
        daysLeft,
        health: healthOf(i.dueDate, daysLeft, dueSoonDays),
        latestNote: latest?.note || "",
        latestNoteBy: latest?.byName || "",
        latestNoteOn: latest?.at ? latest.at.slice(0, 10) : "",
        raisedBy: i.raisedByName || "",
        raisedOn: (i.createdAt || "").slice(0, 10),
        fromMeeting,
        fromMinutesId: i.fromMinutes?.minutesId,
        assigneeIds: i.assigneeIds,
      };
    })
    .sort(
      (a, b) =>
        HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health] ||
        (a.daysLeft ?? 0) - (b.daysLeft ?? 0) ||
        STATUS_RANK[a.statusKey] - STATUS_RANK[b.statusKey] ||
        a.ref.localeCompare(b.ref)
    );
}

export interface SummaryCounts {
  open: number;
  overdue: number;
  dueSoon: number;
  onTrack: number;
  noDate: number;
  blocked: number;
  unassigned: number;
}

export function countRows(rows: SummaryRow[]): SummaryCounts {
  return {
    open: rows.length,
    overdue: rows.filter((r) => r.health === "overdue").length,
    dueSoon: rows.filter((r) => r.health === "due_soon").length,
    onTrack: rows.filter((r) => r.health === "on_track").length,
    noDate: rows.filter((r) => r.health === "no_date").length,
    blocked: rows.filter((r) => r.statusKey === "blocked").length,
    unassigned: rows.filter((r) => !r.owners).length,
  };
}

export interface OwnerLine {
  owner: string;
  open: number;
  overdue: number;
  dueSoon: number;
}

/** Open and overdue per person responsible, most overdue first. An action
 *  with two owners counts once for each of them. */
export function byOwner(rows: SummaryRow[]): OwnerLine[] {
  const map = new Map<string, OwnerLine>();
  for (const r of rows) {
    const owners = r.ownerList.length ? r.ownerList : ["Nobody assigned"];
    for (const owner of owners) {
      const line = map.get(owner) ?? { owner, open: 0, overdue: 0, dueSoon: 0 };
      line.open++;
      if (r.health === "overdue") line.overdue++;
      if (r.health === "due_soon") line.dueSoon++;
      map.set(owner, line);
    }
  }
  return [...map.values()].sort(
    (a, b) => b.overdue - a.overdue || b.dueSoon - a.dueSoon || b.open - a.open || a.owner.localeCompare(b.owner)
  );
}
