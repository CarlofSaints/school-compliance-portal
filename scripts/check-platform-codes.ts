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
  valueOfCode,
  discountKindProblem,
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
    amountOff: null,
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
  check("annual", referral.percentOff?.annual, 15);
  check("monthly", referral.percentOff?.monthly, 10);
  check("ongoing is null cycles", referral.billingCycles, null);
  check("one month off is 1 cycle", code().billingCycles, 1);
}


// ---------------------------------------------------------------------------
// What a code is WORTH. Added 8 Sep 2026 with the code builder UI.
//
// 🔴 A PayFast subscription has two amounts and only two: now, and every time
// after. These checks pin which one a discount lands on, because getting it
// wrong means either giving a school a permanent discount Carl meant to be
// once off, or charging full price to a school he promised a deal to.
// ---------------------------------------------------------------------------
{
  console.log("\n--- what a code is worth ---");

  const firstOnly = (over: Partial<PlatformCode> = {}) =>
    code({ billingCycles: 1, ...over });
  const forever = (over: Partial<PlatformCode> = {}) =>
    code({ billingCycles: null, ...over });

  // 25% off R1,750 = R437.50 off, so R1,312.50 now.
  const a = valueOfCode(firstOnly(), "monthly", "1750.00");
  check("percentage off the first payment", a.firstAmount, "1312.50");
  check("and the renewal is back to list", a.recurringAmount, "1750.00");
  check("description says which", a.description, "25% off, the first payment");

  const b = valueOfCode(forever(), "monthly", "1750.00");
  check("forever discounts the first payment too", b.firstAmount, "1312.50");
  check("and every one after it", b.recurringAmount, "1312.50");
  check("description says which", b.description, "25% off, every payment");

  const randOff = firstOnly({
    percentOff: null,
    amountOff: { monthly: 250, annual: 2000 },
  });
  check(
    "a rand amount comes off the monthly price",
    valueOfCode(randOff, "monthly", "1750.00").firstAmount,
    "1500.00"
  );
  check(
    "and a different one off the annual price",
    valueOfCode(randOff, "annual", "15000.00").firstAmount,
    "13000.00"
  );

  // 🔴 R2,000 off a R1,750 plan is free, not a R250 credit the school keeps.
  const tooBig = firstOnly({
    percentOff: null,
    amountOff: { monthly: 2000, annual: 2000 },
  });
  check(
    "a rand amount bigger than the price makes it free, not negative",
    valueOfCode(tooBig, "monthly", "1750.00").firstAmount,
    "0.00"
  );

  const hundred = firstOnly({ percentOff: { monthly: 100, annual: 100 } });
  check(
    "100% off is free",
    valueOfCode(hundred, "monthly", "1750.00").firstAmount,
    "0.00"
  );
  check(
    "but only the first payment, so the renewal still bills",
    valueOfCode(hundred, "monthly", "1750.00").recurringAmount,
    "1750.00"
  );

  // Rounding: 15% of R15,000 is R2,250 exactly, but 33% of R1,750 is R577.50.
  const odd = firstOnly({ percentOff: { monthly: 33, annual: 33 } });
  check(
    "an awkward percentage still lands on whole cents",
    valueOfCode(odd, "monthly", "1750.00").firstAmount,
    "1172.50"
  );

  console.log("\n--- a code has to take exactly one KIND of discount ---");
  check(
    "both kinds is refused",
    discountKindProblem({
      percentOff: { monthly: 10, annual: 10 },
      amountOff: { monthly: 100, annual: 100 },
    }) !== null,
    true
  );
  check(
    "neither is refused",
    discountKindProblem({ percentOff: null, amountOff: null }) !== null,
    true
  );
  check(
    "a percentage alone is fine",
    discountKindProblem({ percentOff: { monthly: 10, annual: 10 }, amountOff: null }),
    null
  );
  check(
    "a rand amount alone is fine",
    discountKindProblem({ percentOff: null, amountOff: { monthly: 100, annual: 0 } }),
    null
  );
}

console.log(`
${pass} passed, ${fail} failed
`);
process.exit(fail === 0 ? 0 : 1);
