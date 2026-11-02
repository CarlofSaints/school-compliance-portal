// Ask Jono's pricing: actual AI cost, marked up, in tenths; free answers from the Guide.
//   npx tsx scripts/check-jono-billing.ts
import assert from "node:assert/strict";
import { usdCost, creditsForUsd, quoteCredits, jonoCharging, tenth } from "../lib/jonoBilling";
import { freeHowTo } from "../lib/jonoFree";

// 10k fresh input + 50k cached read + 1k written: $0.04 + $0.01 + $0.02 = $0.07.
assert.equal(usdCost({ input_tokens: 10_000, cache_read_input_tokens: 50_000, output_tokens: 1_000 }).toFixed(4), "0.0700");
// $0.07 x R19 x 1.5 / R10 = 0.1995 -> 0.2 credits.
assert.equal(creditsForUsd(0.07), 0.2);
assert.equal(creditsForUsd(0), 0.1, "never free once the AI ran");
// The quote is the worst case: every token at full price + the longest answer.
assert.ok(quoteCredits(60_000, 4000) >= creditsForUsd(usdCost({ input_tokens: 0, cache_read_input_tokens: 60_000, output_tokens: 4000 })));
assert.equal(tenth(0.1 + 0.2), 0.3);

// Charging starts on 16 Nov 2026 (South African date).
assert.equal(jonoCharging(new Date("2026-11-15T21:59:00Z")), false);
assert.equal(jonoCharging(new Date("2026-11-15T22:00:00Z")), true, "midnight SAST");

// Free: clear "how do I" questions the Guide covers; everything else goes to the AI.
assert.ok(freeHowTo("How do I create a new minutes template?", "en")?.includes("Minutes templates"));
assert.ok(freeHowTo("how do i create a new user", "en")?.includes("Create User"));
assert.ok(freeHowTo("How do I add a meeting type?", "en")?.startsWith("**Meeting types"), "singular finds its section");
assert.equal(freeHowTo("Where are we with the school hall project?", "en"), null);
assert.equal(freeHowTo("Can I suspend a learner for hitting another child?", "en"), null);
assert.equal(freeHowTo("How do I make the hall project go faster?", "en"), null);
console.log("check-jono-billing: all passed");
