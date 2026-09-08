import { put, get, list, del } from "@vercel/blob";
import { normaliseCode, type PlatformCode } from "./codes";

// ---------------------------------------------------------------------------
// The STORAGE half of discount codes. Everything that touches Vercel Blob.
//
// Carl: "a way to generate those promo codes: i must be able to set them for
// existing schools (example: 25% off next month) - totally customisable OR for
// new school - again customisable"
//
// A code answers two different questions:
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
//
// 🔴 The pure half lives in ./codes.ts and is re-exported below, so a CLIENT
// component can import the types and the pricing without dragging the Blob SDK
// into the browser bundle. lib/tagData.ts and lib/spendData.ts both shipped it
// before this pattern existed.
// ---------------------------------------------------------------------------

export * from "./codes";

function token(): string {
  const t = process.env.CONTROL_BLOB_READ_WRITE_TOKEN;
  if (!t) throw new Error("CONTROL_BLOB_READ_WRITE_TOKEN is not set.");
  return t;
}

const PATH = (code: string) => `codes/${code}.json`;

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

// ---------------------------------------------------------------------------
// WHAT A CODE IS WORTH.
//
// Carl, 8 Sep 2026: "i really want a UI ... i can decide how they work -
// monthly - i can decide how many month, annual - i can decide on
// amount/percentage".
//
// 🔴 A PayFast subscription has exactly TWO amounts: what you pay now, and
// what you pay on every renewal. That is the whole shape of what a discount
// can be, and it is why `billingCycles` only takes two useful values here:
//
//   1     discount the FIRST payment, then renew at the list price
//   null  discount EVERY payment, for as long as the account lives
//
// "25% off for three months" is not expressible in a single subscription. It
// would need a scheduled job calling PayFast's subscriptions API to raise the
// recurring amount when the discount runs out, and a job that silently fails
// leaves a school discounted forever. Carl chose the two spans that need no
// moving parts (8 Sep); the third can come once payments actually work and it
// can be tested.
// ---------------------------------------------------------------------------

/** Rands off, as an alternative to a percentage. Exactly one of amountOff and
 *  percentOff is set on a code; see assertOneDiscountKind. */
export type PerPlan = { monthly: number; annual: number };

export interface CodeValue {
  /** Rands the school pays now, "1312.50" style, ready for PayFast. */
  firstAmount: string;
  /** Rands on every renewal after that. */
  recurringAmount: string;
  /** Whether anything was taken off at all. */
  discounted: boolean;
  /** Plain English, for the school and for Carl's own list. */
  description: string;
}

/** Both kinds set, or neither, is a code nobody can price. Rejected when it is
 *  created rather than discovered at a checkout. */
export function discountKindProblem(input: {
  percentOff?: PerPlan | null;
  amountOff?: PerPlan | null;
}): string | null {
  const hasPercent =
    !!input.percentOff && (input.percentOff.monthly > 0 || input.percentOff.annual > 0);
  const hasAmount =
    !!input.amountOff && (input.amountOff.monthly > 0 || input.amountOff.annual > 0);
  if (hasPercent && hasAmount) {
    return "Choose a percentage or a rand amount, not both.";
  }
  if (!hasPercent && !hasAmount) {
    return "A code has to take something off.";
  }
  return null;
}

const cents = (rands: string | number) => Math.round(Number(rands) * 100);
const toRands = (c: number) => (Math.max(0, c) / 100).toFixed(2);

/**
 * What this code does to this plan's price.
 *
 * `listAmount` is the plan's list price as PayFast wants it ("1750.00"), and
 * is passed in rather than looked up so this file never has to know what the
 * product costs.
 */
export function valueOfCode(
  code: Pick<PlatformCode, "percentOff" | "amountOff" | "billingCycles">,
  plan: "monthly" | "annual",
  listAmount: string
): CodeValue {
  const list = cents(listAmount);

  const pct = code.percentOff?.[plan] ?? 0;
  const amt = code.amountOff?.[plan] ?? 0;

  // A rand amount is capped at the price. "R2,000 off R1,750" is free, not
  // a credit the school gets to carry.
  const off = pct > 0 ? Math.round((list * pct) / 100) : Math.min(cents(amt), list);

  const first = Math.max(0, list - off);
  const forever = code.billingCycles === null;

  const howMuch = pct > 0 ? `${pct}% off` : `${toRands(cents(amt))} off`;
  const howLong = forever ? "every payment" : "the first payment";

  return {
    firstAmount: toRands(first),
    recurringAmount: forever ? toRands(first) : toRands(list),
    discounted: off > 0,
    description: off > 0 ? `${howMuch}, ${howLong}` : "No discount",
  };
}

/**
 * Writes a redemption onto the code.
 *
 * ⚠️ Read, modify, write on one document. Two schools redeeming the SAME code
 * in the same second could lose one of the two records, which matters only
 * where maxRedemptions is small. Not worth a lock at this volume, but it is
 * why maxRedemptions should be treated as "about this many" rather than a
 * hard gate on anything expensive.
 */
export async function recordRedemption(
  code: string,
  schoolKey: string
): Promise<PlatformCode | null> {
  const existing = await getCode(code);
  if (!existing) return null;
  if (existing.redemptions.some((r) => r.schoolKey === schoolKey)) return existing;

  const next: PlatformCode = {
    ...existing,
    redemptions: [
      ...existing.redemptions,
      { schoolKey, at: new Date().toISOString() },
    ],
  };
  await put(PATH(existing.code), JSON.stringify(next, null, 2), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: token(),
  });
  return next;
}
