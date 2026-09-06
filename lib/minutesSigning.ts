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
