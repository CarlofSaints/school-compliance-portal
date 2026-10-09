import crypto from "crypto";
import { authSigningKey } from "./signingKey";

// ---------------------------------------------------------------------------
// Changing your OWN email address.
//
// 🔴 It used to take effect the moment it was typed. An email address is how
// this portal recognises people beyond the session: minutes reviewers and
// signatories are matched by it, and sign-in finds an account by it. So a
// member could set theirs to the chair's address and approve minutes as the
// chair, or copy a colleague's and break that colleague's sign-in.
//
// Now the new address only takes effect when somebody clicks the link sent TO
// it, which proves they receive mail there. The link is a signed, self-
// contained token (like the reset link and the session), and the signature
// covers the account's current password hash AND current email, so it dies
// if either changes before it is used, and cannot be replayed afterwards.
//
// Format: base64url(JSON {u, n, e}).<hmac>
// ---------------------------------------------------------------------------

export const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000;

interface Claims {
  /** user id */
  u: string;
  /** the new address */
  n: string;
  /** expiry */
  e: number;
}

function hmac(payload: string, user: { password: string; email: string }): string {
  return crypto
    .createHmac("sha256", authSigningKey())
    .update(`emailchange|${payload}|${user.password}|${user.email.trim().toLowerCase()}`)
    .digest("base64url");
}

export function createEmailChangeToken(
  user: { id: string; password: string; email: string },
  newEmail: string,
  now = Date.now()
): string {
  const claims: Claims = { u: user.id, n: newEmail.trim().toLowerCase(), e: now + EMAIL_CHANGE_TTL_MS };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${hmac(payload, user)}`;
}

/** The claims, NOT yet proven. Used to load the account to check against. */
export function readEmailChangeClaims(token: string): Claims | null {
  const parts = String(token || "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const c = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (typeof c?.u !== "string" || typeof c?.n !== "string" || typeof c?.e !== "number") return null;
    return { u: c.u, n: c.n, e: c.e };
  } catch {
    return null;
  }
}

export type EmailChangeCheck = "valid" | "expired" | "invalid";

export function verifyEmailChangeToken(
  token: string,
  user: { id: string; password: string; email: string },
  now = Date.now()
): EmailChangeCheck {
  const claims = readEmailChangeClaims(token);
  if (!claims || claims.u !== user.id) return "invalid";
  const [payload, signature] = token.split(".");
  const a = Buffer.from(hmac(payload, user));
  const b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return "invalid";
  // After the signature, so a guess cannot learn "wrong" from "too late".
  return claims.e > now ? "valid" : "expired";
}
