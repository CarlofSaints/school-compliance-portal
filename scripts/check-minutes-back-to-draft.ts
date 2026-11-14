// Minutes out for signing taken back to Draft (Carl, 14 Nov 2026): signatories
// and their codes dropped, a signature only removed when the caller says so,
// only from "awaiting_signatures", only for managers. Through the real route.
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-minutes-back-to-draft.ts

process.env.AUTH_SECRET ||= "check-back-to-draft-secret";

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

  const { NextRequest } = await import("next/server");
  const { saveRoles } = await import("../lib/rolesData");
  const { DEFAULT_ROLES } = await import("../lib/roles");
  const { createUser } = await import("../lib/userData");
  const { createSessionToken, SESSION_COOKIE } = await import("../lib/session");
  const { tenantScope } = await import("../lib/tenantContext");
  const { createMinutes, updateMinutes, getMinutes } = await import("../lib/minutesData");
  const route = await import("../app/api/minutes/[id]/back-to-draft/route");
  const patchRoute = await import("../app/api/minutes/[id]/route");

  const { key: tenantKey } = await tenantScope();
  await saveRoles(DEFAULT_ROLES);
  const admin = await createUser({ id: "sam", name: "Sam", surname: "Super", email: "sam@example.test", password: "pw-sam", role: "super-admin", forcePasswordChange: false, tagIds: [] });
  const member = await createUser({ id: "erin", name: "Erin", surname: "Member", email: "erin@example.test", password: "pw-erin", role: "sgb-member", forcePasswordChange: false, tagIds: [] });
  const req = (as: { id: string; password: string }, id: string, method: string, body: unknown) =>
    new NextRequest(`http://school.test/api/minutes/${id}`, {
      method,
      body: JSON.stringify(body),
      headers: { cookie: `${SESSION_COOKIE}=${createSessionToken(as, tenantKey)}`, host: "school.test", "content-type": "application/json" },
    });
  const back = (as: { id: string; password: string }, id: string, body: unknown = {}) =>
    route.POST(req(as, id, "POST", body), { params: Promise.resolve({ id }) });

  const signer = (name: string, signed: boolean) => ({
    personId: name, name, email: `${name.toLowerCase()}@example.test`, role: "chair", codeHash: "h", codeSentAt: "2026-11-14T00:00:00Z",
    ...(signed ? { signedAt: "2026-11-14T01:00:00Z", documentHash: "d" } : {}),
  });
  const outForSigning = async (id: string, signed: boolean) => {
    await createMinutes({ id, title: "SGB Nov", body: "sgb", period: { kind: "month", year: 2026, month: 11 }, sections: [{ id: "a", title: "Opening", body: "Opened.", order: 1 }], createdBy: "sam@example.test" } as never);
    await updateMinutes(id, { status: "awaiting_signatures", signatories: [signer("Chair", signed), signer("Principal", false)] } as never);
  };

  // Nobody has signed yet.
  await outForSigning("m1", false);
  check("text is frozen while out for signing", (await patchRoute.PATCH(req(admin, "m1", "PATCH", { title: "New" }), { params: Promise.resolve({ id: "m1" }) })).status, 409);
  check("a member cannot take it back", (await back(member, "m1")).status, 403);
  check("still out for signing after the refusal", (await getMinutes("m1"))?.status, "awaiting_signatures");
  const r1 = await back(admin, "m1");
  check("admin takes it back", r1.status, 200);
  const m1 = await getMinutes("m1");
  check("now Draft", m1?.status, "draft");
  check("signatories (and their codes) dropped", m1?.signatories.length, 0);
  check("text editable again", (await patchRoute.PATCH(req(admin, "m1", "PATCH", { title: "New" }), { params: Promise.resolve({ id: "m1" }) })).status, 200);
  check("a second press is refused", (await back(admin, "m1")).status, 409);

  // Somebody has signed: refused unless the caller says to remove it.
  await outForSigning("m2", true);
  const r2 = await back(admin, "m2");
  check("signed: refused without discardSignatures", r2.status, 409);
  check("signed: the signature survives the refusal", (await getMinutes("m2"))?.signatories.filter((s) => s.signedAt).length, 1);
  const r3 = await back(admin, "m2", { discardSignatures: true });
  check("signed: allowed when told", r3.status, 200);
  check("signed: names who lost a signature", (await r3.json()).dropped, ["Chair"]);
  check("signed: back to Draft, nobody on the list", [(await getMinutes("m2"))?.status, (await getMinutes("m2"))?.signatories.length], ["draft", 0]);

  // Signed by everyone = closed for good.
  await outForSigning("m3", true);
  await updateMinutes("m3", { status: "signed" } as never);
  check("fully signed minutes cannot go back", (await back(admin, "m3", { discardSignatures: true })).status, 409);
  check("still signed", (await getMinutes("m3"))?.status, "signed");

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
