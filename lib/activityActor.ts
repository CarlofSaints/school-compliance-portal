import { NextRequest } from "next/server";
import type { SessionPayload } from "./roles";

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

/** For things nobody did by hand: a cron, a seed, an automatic reminder. */
export function systemActor(what = "System"): Actor {
  return { actorName: what };
}
