// The "how do I..." questions kept for Carl's monthly review.
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-jono-questions.ts
import assert from "node:assert/strict";
import { cleanQuestion, expiredMonth, keepJonoQuestion, listPlatformQuestions, secretMatches, storeOnPlatform } from "../lib/jonoQuestions";
import { readJson } from "../lib/controlData";
import { splitPortalMark } from "../lib/askJono";

async function main() {
  // Only questions Jono itself marks as "how to use the portal" are kept; its
  // answers about records or the law never carry the mark.
  assert.deepEqual(splitPortalMark("[[portal]]\n1. Go to Admin, Tags."), { portalQuestion: true, answer: "1. Go to Admin, Tags." });
  assert.deepEqual(splitPortalMark("The hall project is open (A-012)."), { portalQuestion: false, answer: "The hall project is open (A-012)." });

  assert.equal(expiredMonth("2026-11"), "2025-11");
  assert.equal(expiredMonth("2027-01"), "2026-01");
  assert.deepEqual(cleanQuestion({ school: "  HVPS ", question: "  how\n do I x?  ", at: "2026-11-02T10:00:00Z", locale: "af", outcome: "missed" }), {
    at: "2026-11-02T10:00:00Z", school: "HVPS", locale: "af", question: "how do I x?", outcome: "missed",
  });
  assert.equal(cleanQuestion({ school: "", question: "x" }), null);

  // The shared secret: set on both sides, compared exactly.
  delete process.env.JONO_REVIEW_SECRET;
  assert.equal(secretMatches("anything"), false, "no secret set = nothing accepted");
  process.env.JONO_REVIEW_SECRET = "s3cret-value";
  assert.equal(secretMatches("s3cret-value"), true);
  assert.equal(secretMatches("s3cret-valuX"), false);

  // A single-school deployment with nothing set up keeps it in its own store.
  delete process.env.JONO_REVIEW_URL;
  await keepJonoQuestion({ at: "2026-11-02T10:00:00Z", school: "HVPS", locale: "en", question: "How do I export minutes?", outcome: "ai" });
  assert.equal((await readJson<unknown[]>("jono-questions/2026-11.json", [])).length, 1);

  // The platform store: newest first on the review page.
  process.env.CONTROL_BLOB_READ_WRITE_TOKEN = "control-token";
  await storeOnPlatform({ at: "2026-11-01T09:00:00Z", school: "Demo", locale: "en", question: "first", outcome: "ai" });
  await storeOnPlatform({ at: "2026-11-02T09:00:00Z", school: "Demo", locale: "en", question: "second", outcome: "missed" });
  const months = await listPlatformQuestions();
  const nov = months.find((m) => m.month === "2026-11");
  assert.deepEqual(nov?.items.map((q) => q.question).slice(0, 2), ["second", "first"]);
  console.log("check-jono-questions: all passed");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
