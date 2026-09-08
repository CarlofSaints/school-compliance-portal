// ---------------------------------------------------------------------------
// The PURE half of discount codes: types, formatting, and what a code is
// worth. No storage, no SDK, no environment.
//
// 🔴 Split out because the code builder screen is a CLIENT component. Importing
// these from lib/platformCodes.ts, which opens with `import { put, get, list,
// del } from "@vercel/blob"`, risks shipping the Blob SDK to the browser. That
// has happened here before, twice: lib/tagData.ts and lib/spendData.ts both
// did it, and it was only caught because next/headers turned it into a build
// error. Nothing would turn THIS one into an error. It would just be in the
// bundle.
//
// Same shape as tags.ts / tagData.ts. platformCodes.ts re-exports everything
// here, so server-side imports did not have to change.
// ---------------------------------------------------------------------------

export type CodeAppliesTo = "new_school" | "existing_school";
export type CodeKind = "promo" | "referral";

/** Rands off, or percent off, per plan. */
export type PerPlan = { monthly: number; annual: number };

export interface PlatformCode {
  /** Uppercase, no spaces. What the school types. */
  code: string;
  kind: CodeKind;
  appliesTo: CodeAppliesTo;

  /** Percent off. Kept per-plan because a referral is worth 15 on annual and
   *  10 on monthly, and a flat number could not express that. */
  percentOff: PerPlan | null;

  /** Rands off instead of a percentage. Exactly ONE of percentOff and
   *  amountOff is ever set; a code carrying both cannot be priced. */
  amountOff: PerPlan | null;

  /** 🔴 A PayFast subscription has exactly TWO amounts: what you pay now and
   *  what you pay on every renewal. So this only takes two useful values:
   *    1     discount the FIRST payment, then renew at the list price
   *    null  discount EVERY payment, for as long as the account lives
   *  "25% off for three months" is not expressible in one subscription. */
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

export interface CodeValue {
  /** Rands the school pays now, "1312.50" style, ready for PayFast. */
  firstAmount: string;
  /** Rands on every renewal after that. */
  recurringAmount: string;
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
