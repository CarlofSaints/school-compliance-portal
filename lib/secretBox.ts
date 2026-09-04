import crypto from "crypto";

// ---------------------------------------------------------------------------
// Authenticated encryption for secrets that have to be STORED rather than kept
// in an env var — specifically each tenant's Blob read/write token, which lives
// in the control-plane store because there is one deployment and many schools.
//
// AES-256-GCM, so a tampered ciphertext fails to decrypt rather than quietly
// decrypting to something else. Output is "v1.<iv>.<tag>.<ciphertext>", all
// base64url, and the version prefix is there so the format can be changed later
// without having to guess what an old value is.
// ---------------------------------------------------------------------------

const VERSION = "v1";

// The master key. Unlike the password-reset signing key this one has NO
// fallback: it protects credentials that unlock other schools' data, so a
// deployment that has not been given one must fail loudly rather than quietly
// encrypt everything under something guessable.
function masterKey(): Buffer {
  const raw = process.env.TENANT_SECRET;
  if (!raw) {
    throw new Error(
      "TENANT_SECRET is not set. It is required to read or write tenant credentials."
    );
  }
  // Hashed to exactly 32 bytes so any length of secret is usable, while a
  // different secret always lands on a different key.
  return crypto.createHash("sha256").update(raw).digest();
}

export function seal(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    enc.toString("base64url"),
  ].join(".");
}

export function open(sealed: string): string {
  const parts = String(sealed || "").split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Sealed value is not in the expected format");
  }
  const [, rawIv, rawTag, rawEnc] = parts;
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    masterKey(),
    Buffer.from(rawIv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(rawTag, "base64url"));
  // Throws on a wrong key or a tampered payload. Let it — a caller must never
  // be handed a token it cannot trust.
  return Buffer.concat([
    decipher.update(Buffer.from(rawEnc, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Whether this deployment can handle stored tenant credentials at all. Lets
 *  the single-tenant path carry on working on a deployment with no
 *  TENANT_SECRET, instead of throwing on a code path it never uses. */
export function isSealingAvailable(): boolean {
  return !!process.env.TENANT_SECRET;
}
