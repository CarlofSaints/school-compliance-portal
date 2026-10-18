import { NextRequest, after } from "next/server";
import type { SessionPayload } from "./roles";
import { tenantScope, runInScope } from "./tenantContext";

// ---------------------------------------------------------------------------
// Turning a request and its session into the "who" on an audit entry.
//
// A separate file from lib/activityLog.ts so the log itself stays free of
// next/server, and can be read and tested without a request.
// ---------------------------------------------------------------------------

export interface Actor {
  actorId?: string;
  actorName: string;
  actorEmail?: string;
  ip?: string;
}

/**
 * Best-effort client address.
 *
 * Behind Vercel the socket address is the proxy's, so x-forwarded-for is the
 * only useful source and its FIRST entry is the client. It is spoofable by
 * anyone talking to us directly, so it is recorded as a clue and never relied
 * on for a decision.
 */
export function clientIp(req: NextRequest): string | undefined {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || undefined;
}

export function actorFrom(req: NextRequest, session: SessionPayload): Actor {
  return {
    actorId: session.id,
    // Captured NOW, not looked up later. An audit trail records what was true
    // at the time: if this person is renamed or removed next year, the entry
    // must still say who did it.
    actorName: `${session.name} ${session.surname}`.trim() || session.email,
    actorEmail: session.email,
    ip: clientIp(req),
  };
}

/** The "who" for a known user without a session (signing in, a reset link). */
export function actorFromUser(
  req: NextRequest,
  user: { id: string; name: string; surname: string; email: string }
): Actor {
  return {
    actorId: user.id,
    actorName: `${user.name} ${user.surname}`.trim() || user.email,
    actorEmail: user.email,
    ip: clientIp(req),
  };
}

// Writes queued when there is NO request at all (the check scripts call route
// handlers directly). Capped: past the cap a task simply runs inline.
const pendingOutsideRequest: Promise<unknown>[] = [];
const MAX_PENDING = 1000;

/** Swappable by the check script, to prove a broken scope cannot fail a request. */
export const afterResponseDeps = { tenantScope };

/**
 * Runs a log write AFTER the response has gone, and still guarantees it
 * runs: Vercel keeps the function alive for after() work, so this is not the
 * un-awaited write that silently never happens. Used on sign-in so the
 * logging cannot change how long a reply takes.
 *
 * The school is resolved NOW, while the request is in hand, and the task
 * runs pinned to it: a write after the response must land in the same
 * school's store as the request it belongs to.
 *
 * 🔴 NEVER THROWS. Logging must not turn a good sign-in into a 500, or make a
 * sent reset email look failed. Every failure is written to the console.
 */
export async function afterResponse(task: () => Promise<unknown>): Promise<void> {
  try {
    const scope = await afterResponseDeps.tenantScope();
    const pinned = () =>
      runInScope(scope, task).catch((err) => console.error("[activity] after-response task failed:", err));
    try {
      after(pinned);
    } catch (err) {
      if (!process.env.NEXT_RUNTIME && pendingOutsideRequest.length < MAX_PENDING) {
        // No Next request at all: a script. It awaits these with flushAfterResponse.
        pendingOutsideRequest.push(pinned());
        return;
      }
      // Inside Next, after() should never fail. If it does, say so loudly and
      // do the write now rather than lose it.
      console.error("[activity] after() unavailable, logging inline:", err);
      await pinned();
    }
  } catch (err) {
    console.error("[activity] Could not schedule a log write:", err);
  }
}

/** For check scripts: waits for every afterResponse task queued outside a
 *  request. Returns how many there were. */
export async function flushAfterResponse(): Promise<number> {
  let n = 0;
  for (; pendingOutsideRequest.length; n++) await pendingOutsideRequest.shift();
  return n;
}

/** For things nobody did by hand: a cron, a seed, an automatic reminder. */
export function systemActor(what = "System"): Actor {
  return { actorName: what };
}
