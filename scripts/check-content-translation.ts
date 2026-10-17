// Checks the document-translation add-on's money rules (lib/contentTranslation.ts):
// off means no translation, a stored copy is free, the monthly cap holds, and a
// failed translation gives its allowance back. Fake blob store, no AI key.
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-content-translation.ts

export {};

for (const k of ["BLOB_READ_WRITE_TOKEN", "CONTROL_BLOB_READ_WRITE_TOKEN", "ANTHROPIC_API_KEY", "TENANT_SECRET", "MULTI_TENANT", "TRANSLATION_ADDON"]) {
  delete process.env[k];
}
process.env.NEXT_PUBLIC_SCHOOL ||= "hvps";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`);
}

async function main() {
  const { createRequire } = await import("module");
  const blob = createRequire(__filename)("@vercel/blob") as { __fakeStore?: () => unknown };
  if (typeof blob.__fakeStore !== "function") {
    console.error("Refusing to run: @vercel/blob is the REAL store. Run with --import ./scripts/fake-blob/register.mjs");
    process.exit(1);
  }
  const { writeJson } = await import("../lib/controlData");
  const T = await import("../lib/contentTranslation");
  let sourceCalls = 0;
  const req = (sourceHash: string) => ({
    kind: "policy" as const,
    id: "p1",
    locale: "zu" as const,
    sourceHash,
    title: "Admissions",
    source: async () => {
      sourceCalls++;
      return [{ type: "text" as const, text: "hello" }];
    },
  });

  let r = await T.translateContent(req("v1"));
  check("add-on off: refused with 403", r.ok ? "ok" : r.status, 403);

  await T.saveAddon({ enabled: true, monthlyCap: 1 });
  await writeJson("translations/policy/p1/zu.json", { sourceHash: "v1", text: "sawubona", translatedAt: "x" });
  r = await T.translateContent(req("v1"));
  check("stored copy is returned", r.ok && r.text, "sawubona");
  check("stored copy costs no allowance", await T.getUsage(), 0);
  check("stored copy never reads the source", sourceCalls, 0);

  r = await T.translateContent(req("v2"));
  check("new version, AI fails (no key): 502", r.ok ? "ok" : r.status, 502);
  check("failed translation gives the allowance back", await T.getUsage(), 0);
  check("the source was read for a new version", sourceCalls, 1);

  await writeJson("translations/policy/p1/zu.inflight.json", { at: Date.now() });
  r = await T.translateContent(req("v2"));
  check("already being translated: 409, no second charge", [r.ok ? "ok" : r.status, await T.getUsage(), sourceCalls], [409, 0, 1]);
  await writeJson("translations/policy/p1/zu.inflight.json", { at: Date.now() - 16 * 60_000 });
  r = await T.translateContent(req("v2"));
  check("a stale claim (killed run) is taken over", r.ok ? "ok" : r.status, 502);

  await writeJson(`translations/usage/${T.usageMonth()}.json`, { count: 1 });
  r = await T.translateContent(req("v2"));
  check("cap used up: 429", r.ok ? "ok" : r.status, 429);
  check("cap used up: source not read", sourceCalls, 2);
  r = await T.translateContent(req("v1"));
  check("cap used up: stored copy still readable", r.ok && r.text, "sawubona");

  process.env.TRANSLATION_ADDON = "1";
  await T.saveAddon({ enabled: false, monthlyCap: 5 });
  check("env var switches it on for single-school projects", (await T.getAddon()).enabled, true);

  check("SAST month rolls at 22:00 UTC", T.usageMonth(new Date("2026-10-31T22:30:00Z")), "2026-11");

  console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
  process.exit(failures ? 1 : 0);
}
main();
