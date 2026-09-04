import crypto from "crypto";
import { User } from "./userData";

// ---------------------------------------------------------------------------
// Password-reset tokens.
//
// The token is SELF-CONTAINED and signed — nothing is written to storage when
// one is issued, and nothing is read back to verify it. That is deliberate:
//
//  - A blob path that has never existed before can take a moment to become
//    readable (the same lag that made a saved action item read back stale, see
//    lib/controlData.ts). A reset link is clicked seconds after it is issued,
//    which is exactly the window that would fail.
//  - A shared "resets.json" would be a read-modify-write, and two people
//    resetting at once would lose one of them. That shape has already cost this
//    project real data twice.
//
// Single use comes for free instead of from a "used" flag: the signature is
// keyed on the user's CURRENT password hash, so the moment the password
// changes, every token ever issued for that account stops verifying. Changing
// the password by any other route (My Account, an admin edit) spends them too.
//
// Format: <userId>.<expiryMs>.<hmac>, base64url throughout.
// ---------------------------------------------------------------------------

/** How long a reset link stays usable. Long enough to survive a mail queue and
 *  someone reading it on their phone later; short enough that a forwarded mail
 *  is not a standing key to the account. */
export const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

// Signing key.
//
// AUTH_SECRET is the one to set, but it is deliberately OPTIONAL: a new school
// must be able to come up with nothing but a Blob store, and a reset flow that
// silently does not work until somebody remembers an extra env var is worse
// than no reset flow at all. BLOB_READ_WRITE_TOKEN is the fallback because the
// app provably cannot run without it, and it is already a per-tenant secret.
// It is only ever used as HMAC key material, so it is never exposed.
//
// Rotating whichever value is in play invalidates outstanding links. That is
// the correct behaviour, not a bug.
function signingKey(): string {
  const key =
    process.env.AUTH_SECRET ||
    process.env.CRON_SECRET ||
    process.env.BLOB_READ_WRITE_TOKEN;
  if (!key) {
    throw new Error(
      "No signing key available for password resets (set AUTH_SECRET)"
    );
  }
  return key;
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function sign(userId: string, expiry: number, passwordHash: string): string {
  return crypto
    .createHmac("sha256", signingKey())
    // The password hash is part of the message, so a token dies with the
    // password it was issued against.
    .update(`${userId}.${expiry}.${passwordHash}`)
    .digest("base64url");
}

export function createResetToken(user: User): string {
  const expiry = Date.now() + RESET_TTL_MS;
  return `${b64url(user.id)}.${expiry}.${sign(user.id, expiry, user.password)}`;
}

export interface ParsedResetToken {
  userId: string;
  expiry: number;
  signature: string;
}

/** Pulls the user id out so the caller can load the account. Does NOT prove the
 *  token is genuine — call verifyResetToken with the loaded user for that. */
export function parseResetToken(token: string): ParsedResetToken | null {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [rawId, rawExpiry, signature] = parts;
  const expiry = Number(rawExpiry);
  // Number("") is 0 and Number(undefined) is NaN — both must fail here rather
  // than reading as "expired in 1970" further down.
  if (!Number.isFinite(expiry) || expiry <= 0) return null;
  let userId: string;
  try {
    userId = Buffer.from(rawId, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!userId || !signature) return null;
  return { userId, expiry, signature };
}

export type ResetTokenResult = "valid" | "expired" | "invalid";

export function verifyResetToken(
  parsed: ParsedResetToken,
  user: User
): ResetTokenResult {
  const expected = sign(parsed.userId, parsed.expiry, user.password);
  const a = Buffer.from(expected);
  const b = Buffer.from(parsed.signature);
  // timingSafeEqual throws on a length mismatch, which is itself a tell, so the
  // lengths are compared first and a mismatch is simply "invalid".
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return "invalid";
  // Expiry is checked AFTER the signature so an unsigned guess can never learn
  // the difference between "wrong" and "too late".
  if (Date.now() > parsed.expiry) return "expired";
  return "valid";
}
