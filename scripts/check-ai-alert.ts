// The AI account running out of credit emails School Compliance, once per six
// hours, and any other refusal stays quiet. Anthropic is faked at fetch.
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-ai-alert.ts
import assert from "node:assert/strict";

for (const k of ["BLOB_READ_WRITE_TOKEN", "CONTROL_BLOB_READ_WRITE_TOKEN", "MULTI_TENANT", "RESEND_API_KEY"]) delete process.env[k];

async function main() {
  const { aiClient } = await import("../lib/aiAccount");
  const { isAiOutOfCredit } = await import("../lib/aiErrors");
  const { readJson, writeJson } = await import("../lib/controlData");
  const { readSentEmails, sentEmailMonths } = await import("../lib/sentEmails");
  const { flushAfterResponse } = await import("../lib/activityActor");

  let message = "Your credit balance is too low to access the Anthropic API.";
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message } }), {
      status: 400,
      headers: { "content-type": "application/json", "request-id": "req_1", "anthropic-organization-id": "org-1" },
    })) as typeof fetch;

  const call = async () => {
    const err = await aiClient({ apiKey: "x", maxRetries: 0 })
      .messages.create({ model: "m", max_tokens: 1, messages: [{ role: "user", content: "hi" }] })
      .then(() => null, (e: unknown) => e);
    assert.ok(err, "the caller still gets the error");
    await flushAfterResponse();
    return err;
  };
  const alerts = async () => {
    const months = await sentEmailMonths();
    const lists = await Promise.all(months.map((m) => readSentEmails(m)));
    return lists.flatMap((l) => ("emails" in l ? l.emails : l)).filter((e) => e.kind === "ai.out_of_credit");
  };

  assert.equal(isAiOutOfCredit(await call()), true);
  assert.equal((await alerts()).length, 1, "first refusal alerts");
  assert.equal((await alerts())[0].to, "carl@outerjoin.co.za");

  await call();
  await call();
  assert.equal((await alerts()).length, 1, "repeat refusals inside six hours stay quiet");

  const path = "ai-alerts/out-of-credit.json";
  const { at } = await readJson<{ at: number }>(path, { at: 0 });
  await writeJson(path, { at: at - 6 * 60 * 60 * 1000 - 1 });
  await call();
  assert.equal((await alerts()).length, 2, "still broken six hours later alerts again");

  message = "max_tokens: too large";
  await writeJson(path, { at: 0 });
  assert.equal(isAiOutOfCredit(await call()), false);
  assert.equal((await alerts()).length, 2, "another 400 does not alert");

  console.log("check-ai-alert: all passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
