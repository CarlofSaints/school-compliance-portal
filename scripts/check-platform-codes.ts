// Proves the code rules with no server and no blob.
//
//   npx tsx scripts/check-platform-codes.ts
//
// These decide what a school pays, so the refusals matter as much as the
// acceptances.

import {
  normaliseCode,
  suggestCode,
  codeProblemFor,
  CODE_PROBLEM_MESSAGE,
  type PlatformCode,
} from "../lib/platformCodes";

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.error(`  FAIL ${label}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`);
  }
}
function checkThat(label: string, cond: boolean) {
  check(label, cond, true);
}

const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

function code(over: Partial<PlatformCode> = {}): PlatformCode {
  return {
    code: "LAUNCH25",
    kind: "promo",
    appliesTo: "new_school",
    percentOff: { monthly: 25, annual: 25 },
    billingCycles: 1,
    label: "Launch offer",
    expiresOn: null,
    maxRedemptions: null,
    redemptions: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    createdBy: "carl@outerjoin.co.za",
    ...over,
  };
}

console.log("\nCodes are typed off a page, so input is forgiving");
{
  check("uppercased", normaliseCode("launch25"), "LAUNCH25");
  check("spaces stripped", normaliseCode(" laun ch25 "), "LAUNCH25");
  check("punctuation stripped", normaliseCode("LAUNCH*25!"), "LAUNCH25");
  check("hyphens kept", normaliseCode("jeppe-ref"), "JEPPE-REF");
  check("empty stays empty", normaliseCode(""), "");
  check("only punctuation is empty", normaliseCode("!!!"), "");
}

console.log("\nGenerated codes avoid characters people misread");
{
  for (let i = 0; i < 40; i++) {
    const c = suggestCode();
    // O/0 and I/1/L get misread off a printed page or a WhatsApp.
    if (/[O0I1L]/.test(c)) {
      check(`generated code avoids ambiguous characters (${c})`, false, true);
      break;
    }
  }
  checkThat("no ambiguous characters in 40 codes", true);
  checkThat("a prefix is kept", suggestCode("JEPPE").startsWith("JEPPE-"));
  checkThat("a normalised prefix is used", suggestCode("je ppe!").startsWith("JEPPE-"));
  checkThat("two codes differ", suggestCode() !== suggestCode());
}

console.log("\nA good code is usable");
{
  check("a plain new-school code", codeProblemFor(code(), "riverside"), null);
  check("no school key needed for a new-school code", codeProblemFor(code()), null);
  check("a future expiry is fine", codeProblemFor(code({ expiresOn: tomorrow }), "x"), null);
}

console.log("\nRefusals");
{
  check("revoked", codeProblemFor(code({ revokedAt: "2026-09-02" }), "x"), "revoked");
  check("expired", codeProblemFor(code({ expiresOn: yesterday }), "x"), "expired");
  check(
    "used up",
    codeProblemFor(
      code({ maxRedemptions: 1, redemptions: [{ schoolKey: "other", at: "2026-09-02" }] }),
      "x"
    ),
    "used_up"
  );
  check(
    "under the limit is fine",
    codeProblemFor(
      code({ maxRedemptions: 2, redemptions: [{ schoolKey: "other", at: "2026-09-02" }] }),
      "x"
    ),
    null
  );
  check(
    "the same school cannot use it twice",
    codeProblemFor(code({ redemptions: [{ schoolKey: "x", at: "2026-09-02" }] }), "x"),
    "already_used_by_this_school"
  );
}

console.log("\nA code written for ONE school works only for that school");
{
  const targeted = code({
    appliesTo: "existing_school",
    targetSchoolKey: "hurlyvale",
    label: "25% off next month",
  });
  check("the right school", codeProblemFor(targeted, "hurlyvale"), null);
  check("a different school", codeProblemFor(targeted, "jeppegirls"), "wrong_school");
  // 🔴 With no school key there is nothing to match, so it must refuse rather
  // than fall through and let anyone redeem another school's discount.
  check("no school at all", codeProblemFor(targeted), "wrong_school");
}

console.log("\nRefusal wording gives nothing away");
{
  // A code meant for another school must not be distinguishable from one that
  // does not exist, or the form becomes a way to discover other schools' deals.
  check(
    "wrong school reads as simply unavailable",
    CODE_PROBLEM_MESSAGE.wrong_school,
    "That code is not available."
  );
  for (const [k, v] of Object.entries(CODE_PROBLEM_MESSAGE)) {
    checkThat(`${k} has no em dash`, !v.includes("—"));
    checkThat(`${k} names no school`, !/hurlyvale|jeppe/i.test(v));
  }
}

console.log("\nPer-plan percentages, since a referral differs by plan");
{
  const referral = code({
    kind: "referral",
    percentOff: { annual: 15, monthly: 10 },
    billingCycles: null,
    referrerSchoolKey: "jeppegirls",
  });
  check("annual", referral.percentOff.annual, 15);
  check("monthly", referral.percentOff.monthly, 10);
  check("ongoing is null cycles", referral.billingCycles, null);
  check("one month off is 1 cycle", code().billingCycles, 1);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
