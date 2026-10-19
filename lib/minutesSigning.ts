import crypto from "crypto";
import { SIGNING_ALPHABET, normaliseSigningCode, canonicalMinutes } from "./minutes";
import type { MinutesRecord } from "./minutesData";
import { authSigningKey } from "./signingKey";

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
 * 🔴 KEYED with the server secret. A code is only ~30 bits, so a plain SHA-256
 * of it (what this was until 19 Oct 2026) can be reversed offline in seconds
 * by anyone who sees the stored value. With the key it cannot be tried at all
 * outside the server. Salted with the minutes id as well, so one code issued
 * for two meetings stores differently.
 */
// Its own key, derived from the signing secret, so a signing code and a
// session token are never made with the same key. Rotating that secret voids
// codes already sent: a signer then sends themselves a new one from the page.
function signingCodeKey(): Buffer {
  return crypto.createHmac("sha256", authSigningKey()).update("minutes-signing-code").digest();
}

export function hashSigningCode(code: string, minutesId: string): string {
  return crypto
    .createHmac("sha256", signingCodeKey())
    .update(`${minutesId}:${normaliseSigningCode(code)}`)
    .digest("hex");
}

// Codes emailed before 19 Oct 2026 were stored as a plain SHA-256. They still
// verify until this date, so nobody is stranded mid-signing; after it they are
// refused and the signer sends themselves a new code.
// shortcut: date-based cut-off; delete legacySigningHash after it passes.
const LEGACY_CODES_UNTIL = Date.parse("2026-11-30T00:00:00+02:00");
function legacySigningHash(code: string, minutesId: string): string {
  return crypto
    .createHash("sha256")
    .update(`${minutesId}:${normaliseSigningCode(code)}`)
    .digest("hex");
}

function sameHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Constant time, so the number of correct leading characters cannot be read
 *  off how long the comparison took. */
export function signingCodeMatches(
  code: string,
  minutesId: string,
  storedHash: string | undefined
): boolean {
  if (!storedHash) return false;
  return (
    sameHex(hashSigningCode(code, minutesId), storedHash) ||
    (Date.now() < LEGACY_CODES_UNTIL && sameHex(legacySigningHash(code, minutesId), storedHash))
  );
}

/**
 * 🔴 Every minutes record that leaves the server goes through this. The code
 * hash proves mailbox possession at signing and the IP is audit-only; neither
 * is for any reader's eyes.
 */
export function minutesForClient<T extends Pick<MinutesRecord, "signatories"> | null>(record: T): T {
  if (!record) return record;
  return {
    ...record,
    signatories: (record.signatories || []).map((s) => {
      const { codeHash: _codeHash, ip: _ip, ...rest } = s;
      return rest;
    }),
  };
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

// ---------------------------------------------------------------------------
// The signature MARK that arrives from the browser.
//
// A canvas produces a data URL, which is attacker-controlled text arriving on a
// route any logged-in signatory can call. It is decoded here, deliberately, so
// there is one place that decides what counts as a signature image.
// ---------------------------------------------------------------------------

/** Generous for a signature, small enough that nobody can push a photo album
 *  through the signing route. A drawn 600x200 PNG is a few KB. */
const MAX_SIGNATURE_BYTES = 400 * 1024;

export interface DecodedSignature {
  png: Buffer;
  width: number;
  height: number;
}

export class SignatureError extends Error {}

/**
 * Turns `data:image/png;base64,...` into bytes, or refuses.
 *
 * 🔴 PNG only, and verified by its MAGIC BYTES rather than by the media type in
 * the string. The prefix is written by the caller, so trusting it would let
 * anything at all be stored under a .png name and served back with an image
 * content type.
 */
export function decodeSignature(dataUrl: string): DecodedSignature {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl || "");
  if (!m) throw new SignatureError("That signature could not be read. Draw or type it again.");

  const png = Buffer.from(m[1], "base64");
  if (png.length === 0) {
    throw new SignatureError("That signature is empty. Draw or type it again.");
  }
  if (png.length > MAX_SIGNATURE_BYTES) {
    throw new SignatureError("That signature image is too large.");
  }

  const MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!png.subarray(0, 8).equals(MAGIC)) {
    throw new SignatureError("That signature could not be read. Draw or type it again.");
  }

  // Dimensions come from the IHDR chunk, which a real PNG always starts with,
  // rather than from anything the browser said. Used to keep the aspect ratio
  // in the Word file.
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (!width || !height || width > 4000 || height > 4000) {
    throw new SignatureError("That signature is the wrong shape. Draw or type it again.");
  }

  return { png, width, height };
}
