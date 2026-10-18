// Checks the document-translation credit rules (lib/contentTranslation.ts):
// a stored copy is free, too few credits means no translation, a failed
// translation gives its credits back, and long documents cost more.
// Fake blob store, no AI key.
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-content-translation.ts

export {};

for (const k of ["BLOB_READ_WRITE_TOKEN", "CONTROL_BLOB_READ_WRITE_TOKEN", "ANTHROPIC_API_KEY", "TENANT_SECRET", "MULTI_TENANT"]) {
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
  const req = (sourceHash: string, credits = 1) => ({
    kind: "policy" as const,
    id: "p1",
    locale: "zu" as const,
    sourceHash,
    title: "Admissions",
    credits,
    content: [{ type: "text" as const, text: "hello" }],
    deadline: Date.now() + 60_000,
  });

  check("1 page costs 1 credit", T.creditsFor(1), 1);
  check("10 pages cost 1 credit", T.creditsFor(10), 1);
  check("11 pages cost 2 credits", T.creditsFor(11), 2);
  check("30 pages cost 3 credits", T.creditsFor(30), 3);
  check("3,001 characters is 2 pages", T.textPages("x".repeat(3001)), 2);
  // A re-saved PDF: 3 page objects (one stale copy) under a page tree of 2.
  const fakePdf = Buffer.from(
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >> << /Type /Page >> << /Type/Page >> << /Type /Page >>",
    "latin1"
  );
  check("PDF pages come from the page tree, not stale page objects", await T.pdfPages(fakePdf), 2);
  check("/Count before /Type is read too", await T.pdfPages(Buffer.from("<< /Count 7 /Type /Pages >>", "latin1")), 7);

  let r = await T.translateContent(req("v1"));
  check("no credits: refused with 402", r.ok ? "ok" : r.status, 402);

  await writeJson("translations/policy/p1/zu.json", { sourceHash: "v1", text: "sawubona", translatedAt: "x" });
  r = await T.translateContent(req("v1"));
  check("stored copy is returned with 0 credits", r.ok && r.text, "sawubona");

  check("Carl adds 10 credits", await T.addCredits(10), { balance: 10, applied: 10 });
  r = await T.translateContent(req("v2", 3));
  check("new version, AI fails (no key): 502", r.ok ? "ok" : r.status, 502);
  check("failed translation gives the credits back", await T.getCredits(), 10);

  r = await T.translateContent(req("v2", 11));
  check("more credits than the balance: 402, nothing taken", [r.ok ? "ok" : r.status, await T.getCredits()], [402, 10]);

  await writeJson("translations/policy/p1/zu.inflight.json", { at: Date.now() });
  r = await T.translateContent(req("v2"));
  check("already being translated: 409, no charge", [r.ok ? "ok" : r.status, await T.getCredits()], [409, 10]);
  await writeJson("translations/policy/p1/zu.inflight.json", { at: Date.now() - 16 * 60_000 });
  r = await T.translateContent(req("v2"));
  check("a stale claim (killed run) is taken over", r.ok ? "ok" : r.status, 502);

  check("a correction never takes the balance below 0, and says what it removed", await T.addCredits(-50), { balance: 0, applied: -10 });

  console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
  process.exit(failures ? 1 : 0);
}
main();
