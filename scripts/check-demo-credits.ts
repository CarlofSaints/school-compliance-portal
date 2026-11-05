// The demo school is never gated on credits, and the school beside it still is.
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-demo-credits.ts
import assert from "node:assert/strict";

for (const k of ["BLOB_READ_WRITE_TOKEN", "CONTROL_BLOB_READ_WRITE_TOKEN", "MULTI_TENANT"]) delete process.env[k];
process.env.AUTH_SECRET ||= "check-demo-credits-secret";
process.env.NEXT_PUBLIC_SCHOOL ||= "hvps";

(async () => {
  const { runInScope } = await import("../lib/tenantContext");
  const { addCredits, getCredits, maySpendCredits, spendCredits, withCredits } = await import("../lib/contentTranslation");
  const scope = (key: string) => ({ prefix: `${key}/`, token: undefined, key, fromRegistry: true });

  await runInScope(scope("demo"), async () => {
    assert.equal(await maySpendCredits("nobody"), true, "demo: nobody needs the tick");
    assert.equal(await spendCredits(50000), true, "demo: any amount");
    const before = await getCredits();
    assert.ok(before > 1000, "demo: a balance every page accepts");
    assert.ok((await withCredits(5, async () => "done")).ok);
    await assert.rejects(withCredits(5, async () => { throw new Error("AI down"); }));
    assert.equal(await getCredits(), before, "demo: spending and refunds move nothing");
  });

  await runInScope(scope("realschool"), async () => {
    assert.equal(await getCredits(), 0, "a real school starts with nothing");
    assert.equal(await spendCredits(1), false, "and is refused");
    assert.equal(await maySpendCredits("nobody"), false, "and needs the tick");
    await addCredits(2);
    assert.equal(await spendCredits(1), true);
    assert.equal(await getCredits(), 1, "and is charged");
  });

  console.log("check-demo-credits: all passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
