import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { readJson, updateJson, writeJson } from "./controlData";
import { runInControlStore } from "./tenantContext";

// ---------------------------------------------------------------------------
// Rate limits, counted in the school's own store.
//
// 🔴 Not in memory. Each request can land on a different serverless instance,
// so a counter in a Map would hand an attacker a fresh allowance on every cold
// start and every parallel request. The count lives in a small file per key,
// written through updateJson, so simultaneous requests are all counted.
//
// Fixed windows: a key gets `max` hits per `windowSec`, then 429 until the
// window that began with its first hit ends. Keys are hashed, so no email or
// IP sits in a file name.
//
// This is the layer that knows WHO: an email address, a user, a school. The
// Vercel Firewall rules in front (per IP, see RATE-LIMITS.md) stop floods
// before they reach here and cost nothing to block.
//
// ⚠️ FAILS OPEN on a storage error, deliberately: a limiter that cannot read
// its own counter must not lock the whole school out of signing in. The error
// is logged. The firewall still applies.
// ---------------------------------------------------------------------------

export interface Limit {
  /** Stable name, also the folder: "login-ip", "ai-user"... */
  scope: string;
  max: number;
  windowSec: number;
  /** What the person is told when it is exceeded. "{wait}" becomes "5 minutes". */
  message: string;
  /** Counted in the platform's control store, for requests that arrive before
   *  there is a school (new-school signup). */
  platform?: boolean;
}

export const LIMITS = {
  loginIp: { scope: "login-ip", max: 20, windowSec: 15 * 60, message: "Too many sign-in attempts from this connection. Try again in {wait}." },
  loginAccount: { scope: "login-account", max: 5, windowSec: 15 * 60, message: "Too many wrong passwords for this account. Try again in {wait}, or reset your password." },
  resetRequestIp: { scope: "reset-request-ip", max: 5, windowSec: 60 * 60, message: "Too many reset requests from this connection. Try again in {wait}." },
  resetRequestEmail: { scope: "reset-request-email", max: 3, windowSec: 60 * 60, message: "Too many reset requests for this address. Check your inbox, or try again in {wait}." },
  resetCompleteIp: { scope: "reset-complete-ip", max: 10, windowSec: 15 * 60, message: "Too many attempts. Try again in {wait}." },
  emailChangeUser: { scope: "email-change-user", max: 3, windowSec: 60 * 60, message: "Too many email change requests. Try again in {wait}." },
  confirmEmailIp: { scope: "confirm-email-ip", max: 10, windowSec: 15 * 60, message: "Too many attempts. Try again in {wait}." },
  signupIp: { scope: "signup-ip", max: 3, windowSec: 60 * 60, message: "Too many new schools from this connection. Try again in {wait}, or contact us.", platform: true },
  signupCheckIp: { scope: "signup-check-ip", max: 60, windowSec: 60, message: "Too many checks. Try again in {wait}.", platform: true },
  aiUser: { scope: "ai-user", max: 20, windowSec: 60 * 60, message: "You have run a lot of compliance checks this hour. Try again in {wait}." },
  aiSchool: { scope: "ai-school", max: 200, windowSec: 24 * 60 * 60, message: "Your school has reached today's limit for compliance checks. Try again in {wait}, or contact support." },
  emailSendUser: { scope: "email-send-user", max: 60, windowSec: 60 * 60, message: "You have sent a lot of emails from the portal this hour. Try again in {wait}." },
} satisfies Record<string, Limit>;

interface Bucket {
  start: number; // ms
  count: number;
}

function pathFor(limit: Limit, key: string): string {
  const h = crypto.createHash("sha256").update(`${limit.scope}|${key.trim().toLowerCase()}`).digest("hex").slice(0, 40);
  return `_ratelimit/${limit.scope}/${h}.json`;
}

export interface LimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
}

function decide(limit: Limit, b: Bucket, now: number): LimitResult {
  const resetAt = b.start + limit.windowSec * 1000;
  return {
    ok: b.count <= limit.max,
    remaining: Math.max(0, limit.max - b.count),
    retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

/** The pure step, exported for the check script: one more hit on a bucket. */
export function nextBucket(limit: Limit, b: Bucket | null, now: number): Bucket {
  if (!b || now - b.start >= limit.windowSec * 1000) return { start: now, count: 1 };
  return { start: b.start, count: b.count + 1 };
}

/** Counts one hit and says whether it is allowed. */
export async function hit(limit: Limit, key: string, now = Date.now()): Promise<LimitResult> {
  if (!key) return { ok: true, remaining: limit.max, retryAfter: 0 };
  try {
    const write = () => updateJson<Bucket | null>(pathFor(limit, key), null, (cur) => nextBucket(limit, cur, now));
    const b = limit.platform ? await runInControlStore(write) : await write();
    return decide(limit, b as Bucket, now);
  } catch (err) {
    console.error(`[rate-limit] ${limit.scope}: could not count, allowing:`, err);
    return { ok: true, remaining: limit.max, retryAfter: 0 };
  }
}

/** Reads the count WITHOUT adding to it (for "is this account locked?"). */
export async function peek(limit: Limit, key: string, now = Date.now()): Promise<LimitResult> {
  if (!key) return { ok: true, remaining: limit.max, retryAfter: 0 };
  try {
    const b = await readJson<Bucket | null>(pathFor(limit, key), null);
    if (!b || now - b.start >= limit.windowSec * 1000) return { ok: true, remaining: limit.max, retryAfter: 0 };
    // At the limit already means the NEXT attempt would be over it.
    return { ...decide(limit, b, now), ok: b.count < limit.max };
  } catch (err) {
    console.error(`[rate-limit] ${limit.scope}: could not read, allowing:`, err);
    return { ok: true, remaining: limit.max, retryAfter: 0 };
  }
}

/** Clears a key (a correct password wipes the wrong-password count). */
export async function clear(limit: Limit, key: string): Promise<void> {
  if (!key) return;
  await writeJson(pathFor(limit, key), null).catch(() => {});
}

function humanWait(seconds: number): string {
  if (seconds < 90) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const m = Math.ceil(seconds / 60);
  if (m < 90) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.ceil(m / 60);
  return `${h} hour${h === 1 ? "" : "s"}`;
}

/** The 429 every limited route answers with. */
export function tooMany(limit: Limit, result: LimitResult): NextResponse {
  return NextResponse.json(
    {
      error: limit.message.replace("{wait}", humanWait(result.retryAfter)),
      retryAfterSeconds: result.retryAfter,
      limit: `${limit.max} per ${humanWait(limit.windowSec)}`,
    },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfter), "Cache-Control": "no-store" },
    }
  );
}

/** Hits every limit given; the first one exceeded answers 429. Null = go on. */
export async function enforce(checks: [Limit, string][]): Promise<NextResponse | null> {
  for (const [limit, key] of checks) {
    const r = await hit(limit, key);
    if (!r.ok) return tooMany(limit, r);
  }
  return null;
}

/** The caller's IP as Vercel reports it. Vercel sets these itself, so a client
 *  cannot choose its own counting key by sending a header. */
export function ipOf(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}
