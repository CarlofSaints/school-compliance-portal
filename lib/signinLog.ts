import { readJsonTolerant, updateJson, listFiles } from "./controlData";

// ---------------------------------------------------------------------------
// "How often does each person sign in?"
//
// Every sign-in is ALSO an entry in the activity log (lib/activityLog.ts),
// which is the record. This is the tally beside it, so the Sign-ins view does
// not have to read every auth entry of every month to count them.
//
//   signins/2026-10.json  { "<userId>": { name, email, count, failed, ... } }
//
// 🔴 NOT under activity/: activityMonths() treats every folder there as a month.
//
// One small file per month, changed through updateJson so two people signing
// in at the same moment are both counted. Months are UTC, the same as the
// activity log's, so a sign-in lands in the same month in both.
// Unknown email addresses are NOT tallied (they are in the log): keyed by what
// a stranger typed, this file would grow with every address a bot tries.
// ---------------------------------------------------------------------------

export interface SignInStat {
  name: string;
  email: string;
  /** Successful sign-ins this month. */
  count: number;
  /** Wrong passwords this month. */
  failed: number;
  lastAt?: string;
  lastIp?: string;
  lastDevice?: string;
  /** Per UTC day ("YYYY-MM-DD"), so 7 and 30 day counts are exact. */
  days: Record<string, number>;
  failedDays: Record<string, number>;
}

export type SignInSummary = Record<string, SignInStat>;

const pathFor = (month: string) => `signins/${month}.json`;

/** "Chrome on Windows". Best effort, and never more than a short label. */
export function deviceOf(ua: string | null | undefined): string {
  const s = (ua || "").slice(0, 500);
  if (!s) return "Unknown device";
  const browser =
    /Edg(e|A|iOS)?\//.test(s) ? "Edge"
    : /OPR\/|Opera/.test(s) ? "Opera"
    : /SamsungBrowser/.test(s) ? "Samsung Internet"
    : /Firefox\/|FxiOS/.test(s) ? "Firefox"
    : /Chrome\/|CriOS/.test(s) ? "Chrome"
    : /Safari\//.test(s) ? "Safari"
    : "";
  const os =
    /Windows/.test(s) ? "Windows"
    : /Android/.test(s) ? "Android"
    : /iPad/.test(s) ? "iPad"
    : /iPhone|iPod/.test(s) ? "iPhone"
    : /CrOS/.test(s) ? "ChromeOS"
    : /Mac OS X|Macintosh/.test(s) ? "Mac"
    : /Linux/.test(s) ? "Linux"
    : "";
  if (browser && os) return `${browser} on ${os}`;
  return browser || os || "Unknown device";
}

/** Counts one sign-in (or wrong password) for a known user. NEVER THROWS. */
export async function countSignIn(
  user: { id: string; name: string; surname?: string; email: string },
  outcome: "ok" | "failed",
  ip: string,
  device: string,
  at = new Date().toISOString()
): Promise<void> {
  const day = at.slice(0, 10);
  try {
    await updateJson<SignInSummary>(pathFor(at.slice(0, 7)), {}, (sum) => {
      const s: SignInStat = sum[user.id] || { name: "", email: "", count: 0, failed: 0, days: {}, failedDays: {} };
      s.name = `${user.name} ${user.surname || ""}`.trim() || user.email;
      s.email = user.email;
      if (outcome === "ok") {
        s.count++;
        s.days[day] = (s.days[day] || 0) + 1;
        s.lastAt = at;
        s.lastIp = ip;
        s.lastDevice = device;
      } else {
        s.failed++;
        s.failedDays[day] = (s.failedDays[day] || 0) + 1;
      }
      sum[user.id] = s;
      return sum;
    });
  } catch (err) {
    console.error("[signins] Could not count:", outcome, err);
  }
}

/** Every month's summary, newest first.
 *  shortcut: reads all months (one small file each); page by month if a school runs for decades. */
export async function readSignInSummaries(): Promise<SignInSummary[]> {
  const months = (await listFiles("signins"))
    .map((f) => f.replace(/\.json$/, ""))
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
    .sort()
    .reverse();
  return Promise.all(months.map((m) => readJsonTolerant<SignInSummary>(pathFor(m), {})));
}

export interface SignInRow {
  userId: string;
  name: string;
  email: string;
  lastAt?: string;
  lastIp?: string;
  lastDevice?: string;
  last7: number;
  last30: number;
  failed30: number;
  /** Still on the welcome password and never seen signing in. */
  never: boolean;
  /** No longer a user (the sign-ins are history, so they stay). */
  removed: boolean;
}

/** The latest sign-in per user id, across every month. */
export function lastSignIns(summaries: SignInSummary[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const sum of summaries)
    for (const [id, s] of Object.entries(sum))
      if (s.lastAt && (!out[id] || s.lastAt > out[id])) out[id] = s.lastAt;
  return out;
}

/** One row per user for the Sign-ins view. Pure, so the check script can test it. */
export function buildSignInRows(
  users: { id: string; name: string; surname: string; email: string; forcePasswordChange: boolean }[],
  summaries: SignInSummary[],
  now = new Date()
): SignInRow[] {
  const dayAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString().slice(0, 10);
  const from7 = dayAgo(6);
  const from30 = dayAgo(29);
  const sumFrom = (days: Record<string, number>, from: string) =>
    Object.entries(days).reduce((a, [d, n]) => (d >= from ? a + n : a), 0);

  const rows = new Map<string, SignInRow>();
  const blank = (userId: string, name: string, email: string, removed: boolean): SignInRow => ({
    userId, name, email, last7: 0, last30: 0, failed30: 0, never: false, removed,
  });
  for (const u of users) rows.set(u.id, blank(u.id, `${u.name} ${u.surname}`.trim() || u.email, u.email, false));

  for (const sum of summaries) {
    for (const [id, s] of Object.entries(sum)) {
      let row = rows.get(id);
      if (!row) {
        row = blank(id, s.name, s.email, true);
        rows.set(id, row);
      }
      row.last7 += sumFrom(s.days || {}, from7);
      row.last30 += sumFrom(s.days || {}, from30);
      row.failed30 += sumFrom(s.failedDays || {}, from30);
      if (s.lastAt && (!row.lastAt || s.lastAt > row.lastAt)) {
        row.lastAt = s.lastAt;
        row.lastIp = s.lastIp;
        row.lastDevice = s.lastDevice;
      }
    }
  }
  for (const u of users) {
    const row = rows.get(u.id)!;
    row.never = !row.lastAt && u.forcePasswordChange;
  }
  return [...rows.values()];
}
