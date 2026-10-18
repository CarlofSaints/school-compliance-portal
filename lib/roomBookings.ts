// ---------------------------------------------------------------------------
// Meeting-room booking maths. Pure, no server imports: the calendar draws with
// these on the client and the API validates with the same code, so what the
// grid shows and what the server accepts cannot drift apart.
//
// Ported from the COLAB hub (src/lib/bookings.ts). Times are minutes from
// midnight on a YYYY-MM-DD date in South African time. No Date arithmetic
// across time zones anywhere: dates are strings, day maths runs in UTC.
//
// Any time of day is bookable (Carl: "i dont see why we should limit it at
// all"). The calendar draws the whole day and opens scrolled to SCROLL_TO.
// ---------------------------------------------------------------------------

import { tk, type T } from "./i18n/translate";

export const DAY_START_MINUTE = 0;
export const DAY_END_MINUTE = 24 * 60;
/** Where the calendar opens, so it is not a wall of night-time slots. */
export const SCROLL_TO_MINUTE = 7 * 60;
export const SLOT_MINUTES = 30;
/** Shortest bookable meeting. */
export const MIN_DURATION = 5;
/** How many occurrences a repeat may produce, as in COLAB. */
export const MAX_OCCURRENCES = 52;

const plain: T = (s, vars) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;

/** "08:30" from 510. 1440 reads "24:00". */
export function minuteLabel(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** 510 from "08:30", or null. "24:00" is allowed, as the end of the day. */
export function labelToMinute(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h === 24 && m === 0) return DAY_END_MINUTE;
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** An END time typed as "00:00" means midnight at the end of the day (it
 *  could never be after the start otherwise), so 00:00 to 24:00 can be booked. */
export function endMinuteFromLabel(hhmm: string, startMinute: number): number | null {
  const m = labelToMinute(hhmm);
  if (m === null) return null;
  return m <= startMinute && m === 0 ? DAY_END_MINUTE : m;
}

export function slotStarts(start = DAY_START_MINUTE, end = DAY_END_MINUTE, step = SLOT_MINUTES): number[] {
  const out: number[] = [];
  for (let m = start; m < end; m += step) out.push(m);
  return out;
}

// --- Dates, as YYYY-MM-DD strings ------------------------------------------

export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Parts of "2026-07-29", or null if it is not a real calendar date. */
export function parseDateKey(key: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  return { y, m, d };
}

function keyToUtc(key: string): Date {
  const p = parseDateKey(key);
  if (!p) throw new Error(`Not a date: ${key}`);
  return new Date(Date.UTC(p.y, p.m - 1, p.d));
}

function toDateKey(utc: Date): string {
  return dateKey(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

export function addDays(key: string, days: number): string {
  const d = keyToUtc(key);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateKey(d);
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayIndex(key: string): number {
  return (keyToUtc(key).getUTCDay() + 6) % 7;
}

export function weekStart(key: string): string {
  return addDays(key, -weekdayIndex(key));
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** "2026-07" from "2026-07-29": which storage file a booking lives in. */
export function monthOf(key: string): string {
  return key.slice(0, 7);
}

/** Today in South Africa (UTC+2, no daylight saving). */
export function sastToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 2 * 3_600_000).toISOString().slice(0, 10);
}

/** Minutes since midnight in South Africa right now. */
export function sastNowMinute(now: Date = new Date()): number {
  const d = new Date(now.getTime() + 2 * 3_600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** A start in the past: an earlier day, or earlier today (SAST). */
export function isPast(date: string, startMinute: number, now: Date = new Date()): boolean {
  const today = sastToday(now);
  return date < today || (date === today && startMinute < sastNowMinute(now));
}

/** A booking whose end has come: an earlier day, or ended earlier today. */
export function hasEnded(date: string, endMinute: number, now: Date = new Date()): boolean {
  const today = sastToday(now);
  return date < today || (date === today && endMinute <= sastNowMinute(now));
}

export const DAY_SHORT = [tk("Mon"), tk("Tue"), tk("Wed"), tk("Thu"), tk("Fri"), tk("Sat"), tk("Sun")];
const MONTH_SHORT = [
  tk("Jan"), tk("Feb"), tk("Mar"), tk("Apr"), tk("May"), tk("Jun"),
  tk("Jul"), tk("Aug"), tk("Sep"), tk("Oct"), tk("Nov"), tk("Dec"),
];

export function dayShortName(key: string, t: T = plain): string {
  return t(DAY_SHORT[weekdayIndex(key)]);
}

/** "Wed 29 Jul 2026" */
export function longDateLabel(key: string, t: T = plain): string {
  const p = parseDateKey(key);
  if (!p) return key;
  return `${dayShortName(key, t)} ${p.d} ${t(MONTH_SHORT[p.m - 1])} ${p.y}`;
}

/** "29 Jul to 4 Aug 2026" */
export function weekRangeLabel(monday: string, t: T = plain): string {
  const a = parseDateKey(monday);
  const b = parseDateKey(addDays(monday, 6));
  if (!a || !b) return monday;
  return t("{from} to {to}", {
    from: `${a.d} ${t(MONTH_SHORT[a.m - 1])}`,
    to: `${b.d} ${t(MONTH_SHORT[b.m - 1])} ${b.y}`,
  });
}

/** "20 min", "1 hour", "2 hours 30 min" */
export function durationLabel(mins: number, t: T = plain): string {
  if (mins < 60) return t("{n} min", { n: mins });
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  const h = hours === 1 ? t("1 hour") : t("{n} hours", { n: hours });
  return rest === 0 ? h : `${h} ${t("{n} min", { n: rest })}`;
}

export function slotLabel(startMinute: number, endMinute: number, t: T = plain): string {
  return `${minuteLabel(startMinute)} - ${minuteLabel(endMinute)} (${durationLabel(endMinute - startMinute, t)})`;
}

// --- Overlaps ----------------------------------------------------------------

export type Interval = { date: string; startMinute: number; endMinute: number };

/** Touching ends do not collide, so back-to-back meetings are fine. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.date === b.date && a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

export function findConflicts<E extends Interval>(proposed: Interval[], existing: E[]): { slot: Interval; clash: E }[] {
  const out: { slot: Interval; clash: E }[] = [];
  for (const slot of proposed) {
    const clash = existing.find((e) => overlaps(slot, e));
    if (clash) out.push({ slot, clash });
  }
  return out;
}

// --- Repeats -------------------------------------------------------------------

export type RecurrenceFrequency = "none" | "daily" | "weekly" | "monthly";

export interface Recurrence {
  frequency: RecurrenceFrequency;
  /** Every N days / weeks / months, 1 to 12. */
  interval: number;
  /** Weekly only: 0 = Monday ... 6 = Sunday. Empty = the start day. */
  weekdays: number[];
  endMode: "count" | "date";
  /** endMode "count": occurrences including the first. */
  count: number;
  /** endMode "date": the last date one may fall on. */
  until: string;
}

export const DEFAULT_RECURRENCE: Recurrence = {
  frequency: "none",
  interval: 1,
  weekdays: [],
  endMode: "count",
  count: 10,
  until: "",
};

/** What is sent for a repeat: "Never" drops whatever end fields the form
 *  still holds, so switching back to Never always saves. */
export function normaliseRecurrence(r: Recurrence): Recurrence {
  if (r.frequency === "none") return { ...DEFAULT_RECURRENCE, count: 1 };
  return { ...r, count: r.endMode === "count" ? r.count : 1, until: r.endMode === "date" ? r.until : "" };
}

/** The dates a repeat produces from `start`, capped at MAX_OCCURRENCES. */
export function expandRecurrence(start: string, rule: Recurrence): string[] {
  if (rule.frequency === "none") return [start];
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  const limit =
    rule.endMode === "count" ? Math.min(Math.max(1, Math.floor(rule.count || 1)), MAX_OCCURRENCES) : MAX_OCCURRENCES;
  const until = rule.endMode === "date" && rule.until ? rule.until : null;
  const dates: string[] = [];
  const push = (key: string) => {
    if (until && key > until) return false;
    dates.push(key);
    return dates.length < limit;
  };

  if (rule.frequency === "daily") {
    let cursor = start;
    while (push(cursor)) cursor = addDays(cursor, interval);
  } else if (rule.frequency === "weekly") {
    const days = rule.weekdays.length > 0 ? [...new Set(rule.weekdays)].sort((a, b) => a - b) : [weekdayIndex(start)];
    let monday = weekStart(start);
    let guard = 0;
    outer: while (guard++ < 520) {
      for (const wd of days) {
        const key = addDays(monday, wd);
        if (key < start) continue;
        if (!push(key)) break outer;
      }
      monday = addDays(monday, 7 * interval);
    }
  } else {
    // Monthly on the same day number; a 31st a month lacks is skipped.
    const p = parseDateKey(start);
    if (!p) return [start];
    let year = p.y;
    let month = p.m;
    let guard = 0;
    while (guard++ < 240) {
      if (p.d <= new Date(Date.UTC(year, month, 0)).getUTCDate()) {
        if (!push(dateKey(year, month, p.d))) break;
      }
      month += interval;
      while (month > 12) {
        month -= 12;
        year += 1;
      }
    }
  }
  return dates;
}

/** "Every 2 weeks on Mon, Wed, until Wed 30 Sep 2026" */
export function describeRecurrence(rule: Recurrence, t: T = plain): string {
  if (rule.frequency === "none") return t("Does not repeat");
  const n = Math.max(1, Math.floor(rule.interval || 1));
  let base: string;
  if (rule.frequency === "daily") {
    base = n === 1 ? t("Every day") : t("Every {n} days", { n });
  } else if (rule.frequency === "weekly") {
    base = n === 1 ? t("Every week") : t("Every {n} weeks", { n });
    if (rule.weekdays.length > 0) {
      const days = [...new Set(rule.weekdays)].sort((a, b) => a - b).map((d) => t(DAY_SHORT[d])).join(", ");
      base = t("{base} on {days}", { base, days });
    }
  } else {
    base = n === 1 ? t("Every month") : t("Every {n} months", { n });
  }
  return rule.endMode === "date" && rule.until
    ? t("{base}, until {date}", { base, date: longDateLabel(rule.until, t) })
    : t("{base}, {count} times", { base, count: Math.max(1, Math.floor(rule.count || 1)) });
}
