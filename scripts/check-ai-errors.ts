// The AI provider's "out of credit" refusal is recognised (Ask Jono says so plainly).
//   npx tsx scripts/check-ai-errors.ts
import assert from "node:assert/strict";
import { isAiOutOfCredit } from "../lib/aiErrors";
assert.equal(isAiOutOfCredit(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}')), true);
assert.equal(isAiOutOfCredit(new Error("529 Overloaded")), false);
assert.equal(isAiOutOfCredit(undefined), false);
console.log("check-ai-errors: all passed");
