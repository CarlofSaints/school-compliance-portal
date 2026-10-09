import crypto from "crypto";
import { authSigningKey } from "./signingKey";

// ---------------------------------------------------------------------------
// Sign-in sessions.
//
// 🔴 This replaces the x-user-id header, which WAS the session: the server took
// whatever user id the browser sent and believed it. Any signed-in user could
// read another id off /api/users/directory, send it, and act as that person,
// Super Admin included. Nothing here trusts a value the browser can choose.
//
// The session is a signed token in an httpOnly cookie:
//  - httpOnly: page scripts cannot read it, so an injected script cannot steal
//    it (the guide's uploaded HTML was exactly that kind of script).
//  - SameSite=Lax: another site cannot make the browser send it on a POST.
//    getSessionFromRequest also refuses a write whose Origin is another site.
//  - Self-contained, like the reset link (lib/passwordReset.ts): nothing is
//    written to storage at sign-in, so there is no shared sessions file to lose
//    an update to.
//
// The signature covers three things that end it early:
//  - the TENANT key, so a cookie from one school is worthless on another's
//    address on the shared multi-tenant deployment;
//  - the user's current PASSWORD HASH, so changing or resetting a password
//    signs that account out everywhere (the reset-link trick again);
//  - an EXPIRY, SESSION_TTL_MS after sign-in.
//
// Format: base64url(JSON {u, t, e}).<hmac>. The password hash is in the HMAC
// message only, never in the cookie.
// ---------------------------------------------------------------------------

export const SESSION_COOKIE = "sc_session";

/** How long a sign-in lasts. Long enough that a governor who uses the portal
 *  once a month is not signing in every visit; short enough that a laptop
 *  left signed in at a meeting does not stay a key to the school forever. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface SessionClaims {
  /** user id */
  u: string;
  /** tenant key */
  t: string;
  /** expiry, ms since epoch */
  e: number;
}

function hmac(payloadB64: string, passwordHash: string): string {
  return crypto
    .createHmac("sha256", authSigningKey())
    .update(`session|${payloadB64}|${passwordHash}`)
    .digest("base64url");
}

export function createSessionToken(
  user: { id: string; password: string },
  tenantKey: string,
  now = Date.now()
): string {
  const claims: SessionClaims = { u: user.id, t: tenantKey, e: now + SESSION_TTL_MS };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${hmac(payload, user.password)}`;
}

/** Reads the claims WITHOUT proving them, so the caller can load the user whose
 *  password hash the signature is checked against. Never act on this alone. */
export function readSessionClaims(token: string | undefined | null): SessionClaims | null {
  const parts = String(token || "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const c = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (typeof c?.u !== "string" || typeof c?.t !== "string" || typeof c?.e !== "number") return null;
    return { u: c.u, t: c.t, e: c.e };
  } catch {
    return null;
  }
}

/** True only for a genuine, unexpired token, for THIS tenant, issued against
 *  this user's CURRENT password. */
export function verifySessionToken(
  token: string,
  user: { id: string; password: string },
  tenantKey: string,
  now = Date.now()
): boolean {
  const claims = readSessionClaims(token);
  if (!claims) return false;
  if (claims.u !== user.id || claims.t !== tenantKey) return false;
  if (!(claims.e > now)) return false;
  const [payload, signature] = token.split(".");
  const expected = Buffer.from(hmac(payload, user.password));
  const given = Buffer.from(signature);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** Cookie attributes. Secure everywhere but plain-http localhost, where a
 *  Secure cookie would never come back and local sign-in would fail. */
export function sessionCookieOptions(host: string | null, maxAgeMs = SESSION_TTL_MS) {
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(host || ""));
  return {
    httpOnly: true,
    secure: !local,
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}

/**
 * Whether a state-changing request came from this site.
 *
 * SameSite=Lax already keeps the cookie off a cross-site POST in every current
 * browser; this is the second lock, for older ones. A request with NO Origin
 * (a server-to-server call, curl) is allowed: those carry no browser cookie
 * unless someone copied it, and then Origin is not what protects it.
 */
export function isSameOriginWrite(method: string, origin: string | null, host: string | null): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return true;
  if (!origin) return true;
  try {
    return new URL(origin).host.toLowerCase() === String(host || "").split(",")[0].trim().toLowerCase();
  } catch {
    return false;
  }
}
