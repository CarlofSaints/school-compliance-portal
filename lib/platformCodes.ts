import { put, get, list, del } from "@vercel/blob";

// ---------------------------------------------------------------------------
// Promo and referral codes Carl generates from his own portal.
//
// Carl: "a way to generate those promo codes: i must be able to set them for
// existing schools (example: 25% off next month) - totally customisable OR for
// new school - again customisable"
//
// So a code has to answer two different questions:
//
//   FOR A NEW SCHOOL      applied at signup, discounts what they pay to join
//   FOR AN EXISTING ONE   applied to a named school's NEXT invoice
//
// The second cannot be a signup code at all: that school has already signed up.
// It is a credit sitting against them, waiting for the next bill. Treating both
// as "a discount code" is how somebody hands an existing school a code that
// does nothing.
//
// Lives in the CONTROL store, not a school's: codes are Carl's, they exist
// before the school they are for, and one of them (a referral) is about the
// relationship BETWEEN two schools.
//
// One document per code, never a shared list, for the same reason as everything
// else here: two codes created in the same moment would otherwise erase each
// other.
// ---------------------------------------------------------------------------

export type CodeAppliesTo = "new_school" | "existing_school";
export type CodeKind = "promo" | "referral";

export interface PlatformCode {
  /** Uppercase, no spaces. What the school types. */
  code: string;
  kind: CodeKind;
  appliesTo: CodeAppliesTo;

  /** Percent off. Kept per-plan because a referral is worth 15 on annual and
   *  10 on monthly, and a flat number could not express that. */
  percentOff: { monthly: number; annual: number };

  /** How many invoices it discounts. 1 is "25% off next month"; null is
   *  ongoing, which only a referral should be. */
  billingCycles: number | null;

  /** existing_school only: whose next invoice this lands on. */
  targetSchoolKey?: string;
  /** referral only: which school earns from it. */
  referrerSchoolKey?: string;

  label: string;
  /** ISO date, or null for no expiry. */
  expiresOn: string | null;
  /** How many schools may redeem it. null is unlimited. */
  maxRedemptions: number | null;
  redemptions: { schoolKey: string; at: string }[];

  createdAt: string;
  createdBy: string;
  /** Set instead of deleting, so a code that was honoured stays auditable. */
  revokedAt?: string;
}

function token(): string {
  const t = process.env.CONTROL_BLOB_READ_WRITE_TOKEN;
  if (!t) throw new Error("CONTROL_BLOB_READ_WRITE_TOKEN is not set.");
  return t;
}

const PATH = (code: string) => `codes/${code}.json`;

/** Uppercase, no spaces, only characters somebody can read off a page and type
 *  without ambiguity. */
export function normaliseCode(input: string): string {
  return String(input || "").replace(/[^a-zA-Z0-9-]/g, "").toUpperCase();
}

/** Excludes O/0 and I/1/L, which get misread off a printed page or a WhatsApp
 *  and produce a support conversation instead of a signup. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function suggestCode(prefix = ""): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  const clean = normaliseCode(prefix).slice(0, 10);
  return clean ? `${clean}-${out}` : out;
}

export async function getCode(code: string): Promise<PlatformCode | null> {
  const key = normaliseCode(code);
  if (!key) return null;
  try {
    const r = await get(PATH(key), {
      access: "private",
      useCache: false,
      token: token(),
    });
    if (!r) return null;
    return JSON.parse(await new Response(r.stream).text()) as PlatformCode;
  } catch {
    return null;
  }
}

export async function listCodes(): Promise<PlatformCode[]> {
  const out: PlatformCode[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({
      prefix: "codes/",
      limit: 1000,
      cursor,
      token: token(),
    });
    for (const b of page.blobs) {
      const name = b.pathname.replace(/^codes\//, "").replace(/\.json$/, "");
      const c = await getCode(name);
      if (c) out.push(c);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export class CodeExistsError extends Error {
  constructor(readonly code: string) {
    super(`The code "${code}" already exists.`);
    this.name = "CodeExistsError";
  }
}

/**
 * Creates a code, atomically.
 *
 * allowOverwrite is left off, so the blob service refuses a pathname that
 * already exists and that refusal IS the lock. Without it, generating a code
 * that happens to collide would silently replace somebody else's live discount.
 */
export async function createCode(
  input: Omit<PlatformCode, "code" | "createdAt" | "redemptions"> & {
    code: string;
  }
): Promise<PlatformCode> {
  const code = normaliseCode(input.code);
  if (code.length < 4) {
    throw new Error("A code needs at least 4 characters.");
  }

  const record: PlatformCode = {
    ...input,
    code,
    redemptions: [],
    createdAt: new Date().toISOString(),
  };

  try {
    await put(PATH(code), JSON.stringify(record, null, 2), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      token: token(),
    });
  } catch {
    throw new CodeExistsError(code);
  }
  return record;
}

/** Revoked, not deleted. A code that was honoured has to stay explainable when
 *  somebody asks in six months why a school paid what it paid. */
export async function revokeCode(code: string): Promise<PlatformCode | null> {
  const existing = await getCode(code);
  if (!existing) return null;
  const next = { ...existing, revokedAt: new Date().toISOString() };
  await put(PATH(existing.code), JSON.stringify(next, null, 2), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: token(),
  });
  return next;
}

/** Only for a code created by mistake that nobody has used. */
export async function deleteUnusedCode(code: string): Promise<boolean> {
  const existing = await getCode(code);
  if (!existing) return false;
  if (existing.redemptions.length > 0) return false;
  const page = await list({ prefix: PATH(existing.code), limit: 1, token: token() });
  for (const b of page.blobs) await del(b.url, { token: token() });
  return true;
}

export type CodeProblem =
  | "unknown"
  | "revoked"
  | "expired"
  | "used_up"
  | "wrong_school"
  | "already_used_by_this_school";

/**
 * Whether a school may use this code right now.
 *
 * `schoolKey` is the school trying to redeem. For a new-school code that is the
 * key they are about to claim; for an existing-school code it must match the
 * school the code was written for.
 */
export function codeProblemFor(
  code: PlatformCode,
  schoolKey?: string
): CodeProblem | null {
  if (code.revokedAt) return "revoked";
  if (code.expiresOn) {
    const end = new Date(`${code.expiresOn}T23:59:59Z`).getTime();
    if (Number.isFinite(end) && Date.now() > end) return "expired";
  }
  if (
    code.maxRedemptions !== null &&
    code.redemptions.length >= code.maxRedemptions
  ) {
    return "used_up";
  }
  if (code.appliesTo === "existing_school") {
    if (!schoolKey || code.targetSchoolKey !== schoolKey) return "wrong_school";
  }
  if (schoolKey && code.redemptions.some((r) => r.schoolKey === schoolKey)) {
    return "already_used_by_this_school";
  }
  return null;
}

/** Wording for each refusal. Deliberately vague about WHY a code is unusable
 *  where the reason is somebody else's business: "not available" covers a code
 *  meant for another school, so this cannot be used to discover what deals
 *  other schools were given. */
export const CODE_PROBLEM_MESSAGE: Record<CodeProblem, string> = {
  unknown: "We do not recognise that code.",
  revoked: "That code is no longer available.",
  expired: "That code has expired.",
  used_up: "That code has already been used.",
  wrong_school: "That code is not available.",
  already_used_by_this_school: "That code has already been used on this school.",
};
