import crypto from "crypto";
import { authSigningKey } from "./signingKey";
import { readJson, updateJson, deleteFileStrict, NO_CHANGE } from "./controlData";
import { SUPER_ADMIN_ROLE_ID } from "./rolesData";

// ---------------------------------------------------------------------------
// Two-step sign-in (an authenticator app code) for Super Admins.
//
// Only Super Admin is made to use it: one stolen Super Admin password exposes
// the whole school, a stolen staff password exposes one person's items, and
// forcing phones on governors who sign in once a term costs more than it buys.
//
// Codes are standard TOTP (RFC 6238: SHA-1, 30 seconds, 6 digits), so Google
// Authenticator, Microsoft Authenticator, Authy and 1Password all work.
//
// Kept in its own file per user (users/<id>/mfa.json), NOT on the User record,
// so every route that hands a user to the browser cannot leak it by accident.
// The app secret is sealed (AES-256-GCM) under a key derived from the
// existing signing key, so no new env var is needed. 🔴 Changing that key
// (AUTH_SECRET, or whichever fallback is in use) makes enrolled apps
// unreadable: those admins sign in with a BACKUP CODE, which is hashed and
// survives, and then set up again (another Super Admin can press Reset MFA).
// ---------------------------------------------------------------------------

export interface MfaRecord {
  /** sealed base32 secret */
  secret: string;
  /** sha256 of each unused backup code */
  backupHashes: string[];
  /** last 30-second step accepted, so one code cannot be used twice */
  lastStep: number;
  enabledAt: string;
}

const STEP_SEC = 30;
export const BACKUP_CODE_COUNT = 10;
/** How long between the password and the code. */
export const PENDING_TTL_MS = 10 * 60 * 1000;

export function mfaRequired(user: { role: string }): boolean {
  return user.role === SUPER_ADMIN_ROLE_ID;
}

const path = (userId: string) => `users/${userId}/mfa.json`;

export function getMfa(userId: string): Promise<MfaRecord | null> {
  return readJson<MfaRecord | null>(path(userId), null);
}

export function deleteMfa(userId: string): Promise<void> {
  return deleteFileStrict(path(userId));
}

// --- base32 (RFC 4648, what authenticator apps expect) ----------------------

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of s.replace(/[\s=]/g, "").toUpperCase()) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error("Not base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// --- TOTP -------------------------------------------------------------------

export function newSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function totpAt(secret: string, step: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = (h.readUInt32BE(o) & 0x7fffffff) % 1_000_000;
  return String(n).padStart(6, "0");
}

/** The step the code matches, allowing one step either side for a phone
 *  clock that is a little out; null when it matches none, or only a step at
 *  or before `lastStep` (already used). */
export function matchTotp(secret: string, code: string, lastStep: number, now = Date.now()): number | null {
  const want = String(code).replace(/\s/g, "");
  if (!/^\d{6}$/.test(want)) return null;
  const step = Math.floor(now / 1000 / STEP_SEC);
  for (const s of [step - 1, step, step + 1]) {
    if (s <= lastStep) continue;
    const got = totpAt(secret, s);
    if (crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) return s;
  }
  return null;
}

export function otpauthUri(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SEC}`;
}

// --- backup codes -----------------------------------------------------------

// No 0/O/1/I: they are read off paper.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const normaliseCode = (c: string) => String(c).toUpperCase().replace(/[^A-Z0-9]/g, "");
export const hashBackupCode = (c: string) =>
  crypto.createHash("sha256").update(`mfa-backup|${normaliseCode(c)}`).digest("hex");

export function newBackupCodes(): string[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, () => {
    const s = Array.from(crypto.randomBytes(10), (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

export function looksLikeBackupCode(code: string): boolean {
  return normaliseCode(code).length === 10;
}

// --- sealing the secret -----------------------------------------------------

function sealKey(): Buffer {
  return crypto.createHash("sha256").update(`mfa-seal|${authSigningKey()}`).digest();
}

export function sealSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", sealKey(), iv);
  const enc = Buffer.concat([c.update(secret, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

/** null when it cannot be opened (the signing key changed, or tampering). */
export function openSecret(sealed: string): string | null {
  const [v, iv, tag, enc] = String(sealed || "").split(".");
  if (v !== "v1" || !iv || !tag || !enc) return null;
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", sealKey(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// --- the half-signed-in token -----------------------------------------------
//
// After the right password, before the code. Same shape as the session token
// (lib/session.ts): signed against the tenant and the CURRENT password hash,
// so a password change kills it. It is NOT a session: nothing accepts it but
// /api/auth/mfa. For a first set-up it also carries the new secret, sealed,
// so nothing is stored until the person proves their app works.

interface PendingClaims {
  u: string;
  t: string;
  e: number;
  /** sealed secret being set up; absent when already enrolled */
  s?: string;
}

function pendingHmac(payload: string, passwordHash: string): string {
  return crypto
    .createHmac("sha256", authSigningKey())
    .update(`mfa-pending|${payload}|${passwordHash}`)
    .digest("base64url");
}

export function createPendingToken(
  user: { id: string; password: string },
  tenantKey: string,
  sealedSetupSecret?: string,
  now = Date.now()
): string {
  const claims: PendingClaims = { u: user.id, t: tenantKey, e: now + PENDING_TTL_MS };
  if (sealedSetupSecret) claims.s = sealedSetupSecret;
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${pendingHmac(payload, user.password)}`;
}

/** Unproven claims, only to find the user to check the token against. */
export function readPendingClaims(token: unknown): PendingClaims | null {
  const parts = String(token || "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const c = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (typeof c?.u !== "string" || typeof c?.t !== "string" || typeof c?.e !== "number") return null;
    if (c.s !== undefined && typeof c.s !== "string") return null;
    return c;
  } catch {
    return null;
  }
}

export function verifyPendingToken(
  token: string,
  user: { id: string; password: string },
  tenantKey: string,
  now = Date.now()
): PendingClaims | null {
  const claims = readPendingClaims(token);
  if (!claims || claims.u !== user.id || claims.t !== tenantKey || !(claims.e > now)) return null;
  const [payload, signature] = token.split(".");
  const expected = Buffer.from(pendingHmac(payload, user.password));
  const given = Buffer.from(signature);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given) ? claims : null;
}

// --- the checks that write --------------------------------------------------

export type CodeResult = "ok" | "backup" | "wrong";

/** Checks an enrolled user's code and, in the same guarded write, records the
 *  step used or spends the backup code, so neither works twice. */
export async function checkCode(userId: string, code: string, now = Date.now()): Promise<{ result: CodeResult; backupLeft?: number }> {
  let result: CodeResult = "wrong";
  let backupLeft: number | undefined;
  await updateJson<MfaRecord | null>(path(userId), null, (rec) => {
    result = "wrong";
    if (!rec) return NO_CHANGE;
    if (looksLikeBackupCode(code)) {
      const h = hashBackupCode(code);
      if (!rec.backupHashes.includes(h)) return NO_CHANGE;
      result = "backup";
      backupLeft = rec.backupHashes.length - 1;
      return { ...rec, backupHashes: rec.backupHashes.filter((x) => x !== h) };
    }
    const secret = openSecret(rec.secret);
    const step = secret ? matchTotp(secret, code, rec.lastStep, now) : null;
    if (step === null) return NO_CHANGE;
    result = "ok";
    return { ...rec, lastStep: step };
  });
  return { result, backupLeft };
}

/** First set-up: the code must come from the new secret. Returns the backup
 *  codes to show ONCE, or null for a wrong code. Never replaces an existing
 *  set-up: a set-up token used twice must not swap in a new app. */
export async function enrol(userId: string, sealedSecret: string, code: string, now = Date.now()): Promise<string[] | null> {
  const secret = openSecret(sealedSecret);
  const step = secret ? matchTotp(secret, code, -1, now) : null;
  if (step === null) return null;
  const codes = newBackupCodes();
  const rec: MfaRecord = {
    secret: sealedSecret,
    backupHashes: codes.map(hashBackupCode),
    lastStep: step,
    enabledAt: new Date(now).toISOString(),
  };
  let written = false;
  await updateJson<MfaRecord | null>(path(userId), null, (old) => {
    written = !old;
    return old ? NO_CHANGE : rec;
  });
  return written ? codes : null;
}
