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

// Writes queued outside a request (the check scripts call route handlers
// directly, where after() has no request to attach to).
const pendingOutsideRequest: Promise<unknown>[] = [];

/**
 * Runs a log write AFTER the response has gone, and still guarantees it
 * runs: Vercel keeps the function alive for after() work, so this is not the
 * un-awaited write that silently never happens. Used on sign-in so the
 * logging cannot change how long a reply takes.
 *
 * The school is resolved NOW, while the request is in hand, and the task
 * runs pinned to it: a write after the response must land in the same
 * school's store as the request it belongs to.
 */
export async function afterResponse(task: () => Promise<unknown>): Promise<void> {
  const scope = await tenantScope();
  const pinned = () => runInScope(scope, task);
  try {
    after(pinned);
  } catch {
    // Only outside a request scope (scripts). The script awaits these.
    pendingOutsideRequest.push(pinned().catch((err) => console.error("[activity] after task failed:", err)));
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
