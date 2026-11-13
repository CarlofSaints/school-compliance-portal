// WhatsApp messages charged at Meta's rate with a 25% margin on the ex-VAT price.
//
//   npx tsx scripts/check-whatsapp-billing.ts

import { waMeter, waRandPerMessage, WA_MARGIN, VAT } from "../lib/whatsappBilling";
import { RAND_PER_CREDIT, USD_TO_ZAR } from "../lib/jonoBilling";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`);
}

const price = waRandPerMessage();
const cost = 0.0095 * USD_TO_ZAR;
const exVat = price / (1 + VAT);
check("price per message ~R0.28 incl. VAT", Math.round(price * 100) / 100, 0.28);
check("margin is 25% of the ex-VAT price", Math.round(((exVat - cost) / exVat) * 1000) / 1000, WA_MARGIN);

// 3 messages = R0.83: under a tenth (R1), nothing taken, all carried.
const a = waMeter(0, 3);
check("3 messages: nothing taken yet", a.credits, 0);
check("3 messages: R0.83 carried", Math.round(a.carryRand * 100) / 100, 0.83);
// 2 more = R1.38 owed: 0.1 credit taken, R0.38 carried.
const b = waMeter(a.carryRand, 2);
check("5 messages: 0.1 credit", b.credits, 0.1);
check("5 messages: R0.38 carried", Math.round(b.carryRand * 100) / 100, 0.38);

// Nothing lost or gained over many small sends: 1000 one-by-one = 1000 at once.
let carry = 0;
let taken = 0;
for (let i = 0; i < 1000; i++) {
  const r = waMeter(carry, 1);
  carry = r.carryRand;
  taken += r.credits;
}
const once = waMeter(0, 1000);
check("1000 singly = 1000 at once", Math.round(taken * 10) / 10, once.credits);
check("1000 messages = 27.6 credits (R276)", once.credits, 27.6);
check("carry always under a tenth", carry < RAND_PER_CREDIT / 10, true);

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
