import { readJson, readJsonTolerant, updateJson, listFilesStrict, deleteFileStrict, NO_CHANGE } from "./controlData";
import { getUserById } from "./userData";
import { isPlausibleEmail } from "./emailIdentity";
import { tenantScope } from "./tenantContext";

// ---------------------------------------------------------------------------
// "How often does each person sign in?"
//
// Every sign-in is ALSO an entry in the activity log (lib/activityLog.ts),
// which is the record. This is the tally beside it, so the Sign-ins view does
// not have to read every auth entry of every month to count them.
//
//   signins/users/<userId>.json  { name, email, lastAt, lastIp, lastDevice, days, failedDays }
//   signins/meta.json            { since }  when this school's tracking began
//
// 🔴 NOT under activity/: activityMonths() treats every folder there as a month.
//
// ONE FILE PER USER, so a sign-in only ever contends with the same person
// signing in at the same moment (updateJson settles that), never with the
// rest of the school. Days are SAST (UTC+2) and only the last 31 are kept, so
// a file stays a few hundred bytes for good.
// Unknown email addresses are NOT tallied (they are in the log): keyed by what
// a stranger typed, this folder would grow with every address a bot tries.
// ---------------------------------------------------------------------------

export interface SignInStat {
  name: string;
  email: string;
  lastAt?: string;
  lastIp?: string;
  lastDevice?: string;
  /** Sign-ins per SAST day ("YYYY-MM-DD"), last 31 days only. */
  days: Record<string, number>;
  /** Wrong passwords per SAST day, last 31 days only. */
  failedDays: Record<string, number>;
}

const KEEP_DAYS = 31;
const SAST_MS = 2 * 60 * 60 * 1000;
const userPath = (id: string) => `signins/users/${id}.json`;
const META_PATH = "signins/meta.json";
// Schools whose meta.json this instance knows exists. Per instance on purpose:
// it only skips a read, it never decides anything.
const metaSeen = new Set<string>();

/** For check scripts: act like a fresh serverless instance. */
export function forgetTrackingCache(): void {
  metaSeen.clear();
}

/** An instant as SAST wall-clock time, ISO-shaped ("YYYY-MM-DDTHH:MM..."). */
export function sastIso(ms: number): string {
  return new Date(ms + SAST_MS).toISOString();
}

/** The SAST calendar day of an instant, as "YYYY-MM-DD". */
export function sastDay(ms: number): string {
  return sastIso(ms).slice(0, 10);
}

/**
 * What may be kept of what somebody typed into the email box.
 *
 * 🔴 Never the raw text: people type their PASSWORD into the email box. Only
 * something that looks like a real address keeps its domain, masked
 * ("j***@hvps.co.za"): all lowercase as typed, domain labels of [a-z0-9-],
 * and a letters-only top-level domain of 2+. A password with an @ and a dot in
 * it ("Summer@Holiday.2026") fails that and is kept only as the fact that it
 * was not an address.
 */
export function maskTypedEmail(typed: unknown): string {
  const s = String(typed ?? "").trim();
  const domain = s.slice(s.lastIndexOf("@") + 1);
  if (
    !isPlausibleEmail(s) ||
    /[A-Z]/.test(s) ||
    domain.length > 100 ||
    !/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)
  ) {
    return "not an email address";
  }
  return `${s[0]}***@${domain}`;
}

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

function bump(days: Record<string, number>, day: string, oldest: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [d, n] of Object.entries(days)) if (d >= oldest) out[d] = n;
  out[day] = (out[day] || 0) + 1;
  return out;
}

/** Counts one sign-in (or wrong password) for a known user. NEVER THROWS. */
export async function countSignIn(
  user: { id: string; name: string; surname?: string; email: string },
  outcome: "ok" | "failed",
  ip: string | undefined,
  device: string,
  at = new Date().toISOString()
): Promise<void> {
  const ms = Date.parse(at);
  const day = sastDay(ms);
  const oldest = sastDay(ms - (KEEP_DAYS - 1) * 86400000);
  try {
    // A deferred write can land after the user was deleted: never recreate
    // the tally of somebody who is gone.
    if (!(await getUserById(user.id))) return;
    // mutate can run more than once; the LAST run is the one that was saved.
    let created = false;
    await updateJson<SignInStat | null>(userPath(user.id), null, (cur) => {
      created = cur === null;
      const s: SignInStat = cur || { name: "", email: "", days: {}, failedDays: {} };
      s.name = `${user.name} ${user.surname || ""}`.trim() || user.email;
      s.email = user.email;
      if (outcome === "ok") {
        s.days = bump(s.days || {}, day, oldest);
        s.lastAt = at;
        s.lastIp = ip;
        s.lastDevice = device;
      } else {
        s.failedDays = bump(s.failedDays || {}, day, oldest);
      }
      return s;
    });
    // Deleted while this write was in flight: erase what it just created.
    if (!(await getUserById(user.id))) {
      await deleteFileStrict(userPath(user.id)).catch((err) =>
        console.error("[signins] Could not erase the tally of a user deleted mid-write", user.id, err)
      );
      return;
    }
    // The school's tracking date, write-once. Ensured on a user's first tally,
    // and again whenever this instance has not yet seen it exist, so a failed
    // first write is repaired by the next sign-in. Once seen, never re-read.
    const { key } = await tenantScope();
    if (created || !metaSeen.has(key)) {
      await updateJson<{ since: string } | null>(META_PATH, null, (cur) => (cur ? NO_CHANGE : { since: at }));
      metaSeen.add(key);
    }
  } catch (err) {
    console.error("[signins] Could not count:", outcome, err);
  }
}

/** Erases a deleted user's tally (privacy). Never throws; a real storage
 *  failure is logged. The activity log keeps its entries: an audit trail
 *  records what happened. */
export async function deleteSignInStats(userId: string): Promise<void> {
  await deleteFileStrict(userPath(userId)).catch((err) =>
    console.error("[signins] Could not delete the tally of deleted user", userId, err)
  );
}

/** Every user's tally, by user id, read in parallel. The LISTING throws on a
 *  storage error (an empty answer would read as "nobody has signed in"); one
 *  unreadable file is skipped rather than failing the whole view. */
export async function readSignInStats(): Promise<Record<string, SignInStat>> {
  const ids = (await listFilesStrict("signins/users")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
  const stats = await Promise.all(ids.map((id) => readJsonTolerant<SignInStat | null>(userPath(id), null)));
  const out: Record<string, SignInStat> = {};
  ids.forEach((id, i) => {
    if (stats[i]) out[id] = stats[i]!;
  });
  return out;
}

/** When this school's sign-ins started being counted. Null before the first one. */
export async function trackingSince(): Promise<string | null> {
  return (await readJson<{ since: string } | null>(META_PATH, null))?.since || null;
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
  /** Created after tracking began and never seen signing in. */
  never: boolean;
  /** Created before tracking began, and no sign-in seen since. */
  noneSinceTracking: boolean;
}

/** One row per user for the Sign-ins view. Pure, so the check script can test it. */
export function buildSignInRows(
  users: { id: string; name: string; surname: string; email: string; createdAt: string }[],
  stats: Record<string, SignInStat>,
  since: string | null,
  now = Date.now()
): SignInRow[] {
  const from7 = sastDay(now - 6 * 86400000);
  const from30 = sastDay(now - 29 * 86400000);
  const sumFrom = (days: Record<string, number> = {}, from: string) =>
    Object.entries(days).reduce((a, [d, n]) => (d >= from ? a + n : a), 0);
  const row = (userId: string, name: string, email: string, createdAt: string): SignInRow => {
    const s = stats[userId];
    const seen = !!s?.lastAt;
    // Only someone created after counting began can truly be "never": anyone
    // older may well have signed in before there was anything to count it.
    const after = !!since && Date.parse(createdAt) >= Date.parse(since);
    return {
      userId, name, email,
      lastAt: s?.lastAt, lastIp: s?.lastIp, lastDevice: s?.lastDevice,
      last7: sumFrom(s?.days, from7),
      last30: sumFrom(s?.days, from30),
      failed30: sumFrom(s?.failedDays, from30),
      never: !seen && after,
      noneSinceTracking: !seen && !after,
    };
  };
  // Current users only: a deleted user's tally is erased with them, and any
  // file left behind by a failed delete is ignored.
  return users.map((u) => row(u.id, `${u.name} ${u.surname}`.trim() || u.email, u.email, u.createdAt));
}
