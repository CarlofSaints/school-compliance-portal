import crypto from "crypto";
import { SIGNING_ALPHABET, normaliseSigningCode, canonicalMinutes } from "./minutes";
import type { MinutesRecord } from "./minutesData";

// ---------------------------------------------------------------------------
// The crypto half of signing. Separate from lib/minutes.ts because that file is
// imported by client components and node:crypto cannot be.
// ---------------------------------------------------------------------------

/** Six characters from an unambiguous alphabet, drawn from the system CSPRNG.
 *
 *  Math.random would be wrong here: it is seeded predictably and a signature
 *  code that can be guessed from the previous one is not a signature. */
export function mintSigningCode(): string {
  const bytes = crypto.randomBytes(6);
  let out = "";
  for (const b of bytes) out += SIGNING_ALPHABET[b % SIGNING_ALPHABET.length];
  return out;
}

/**
 * Salted with the minutes id, so the same code issued for two different
 * meetings hashes differently and one leaked hash cannot be matched against
 * another set of minutes.
 */
export function hashSigningCode(code: string, minutesId: string): string {
  return crypto
    .createHash("sha256")
    .update(`${minutesId}:${normaliseSigningCode(code)}`)
    .digest("hex");
}

/** Constant time, so the number of correct leading characters cannot be read
 *  off how long the comparison took. */
export function signingCodeMatches(
  code: string,
  minutesId: string,
  storedHash: string | undefined
): boolean {
  if (!storedHash) return false;
  const given = Buffer.from(hashSigningCode(code, minutesId), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (given.length !== stored.length) return false;
  return crypto.timingSafeEqual(given, stored);
}

/** The hash a signature is bound to: what the document said at that moment. */
export function documentHash(record: MinutesRecord): string {
  return crypto.createHash("sha256").update(canonicalMinutes(record), "utf8").digest("hex");
}

/** Shown to a reader as proof, so it has to be short enough to compare by eye
 *  and long enough not to collide by accident. */
export function shortHash(hash: string | undefined): string {
  return (hash || "").slice(0, 12).toUpperCase();
}
