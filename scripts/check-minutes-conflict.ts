// Two people editing the same minutes: the second save must be refused, not
// silently written over the first. Drives the REAL PATCH route against the
// in-memory blob fake, so nothing touches a real school:
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-minutes-conflict.ts

export {};

for (const k of ["BLOB_READ_WRITE_TOKEN", "CONTROL_BLOB_READ_WRITE_TOKEN", "RESEND_API_KEY", "ANTHROPIC_API_KEY", "TENANT_SECRET", "MULTI_TENANT"]) {
  delete process.env[k];
}
process.env.AUTH_SECRET = "minutes-conflict-test-secret";
process.env.NEXT_PUBLIC_SCHOOL ||= "hvps";

const HOST = "school.test";
let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`);
}

async function main() {
  const { createRequire } = await import("module");
  const blob = createRequire(__filename)("@vercel/blob") as { __fakeStore?: () => Map<string, unknown> };
  if (typeof blob.__fakeStore !== "function") {
    console.error("Refusing to run: @vercel/blob is the REAL store. Run with --import ./scripts/fake-blob/register.mjs");
    process.exit(1);
  }

  const { NextRequest } = await import("next/server");
  const { DEFAULT_ROLES } = await import("../lib/roles");
  const { saveRoles } = await import("../lib/rolesData");
  const { createUser } = await import("../lib/userData");
  const { createSessionToken, SESSION_COOKIE } = await import("../lib/session");
  const { tenantScope } = await import("../lib/tenantContext");
  const { createMinutes, getMinutes, updateMinutes } = await import("../lib/minutesData");
  const route = await import("../app/api/minutes/[id]/route");
  const { key: tenantKey } = await tenantScope();

  await saveRoles(DEFAULT_ROLES);
  const admin = await createUser({
    id: "sec", name: "Sam", surname: "Secretary", email: "sec@example.test", password: "pw-sec",
    role: "super-admin", forcePasswordChange: false, tagIds: [],
  });
  const cookie = `${SESSION_COOKIE}=${createSessionToken(admin, tenantKey)}`;
  const patch = (id: string, json: unknown) =>
    route.PATCH(
      new NextRequest(`http://${HOST}/api/minutes/${id}`, {
        method: "PATCH",
        headers: { cookie, host: HOST, origin: `http://${HOST}`, "content-type": "application/json" },
        body: JSON.stringify(json),
      }),
      { params: Promise.resolve({ id }) }
    );

  const m = await createMinutes({
    title: "SGB October", body: "sgb", period: { kind: "month", year: 2026, month: 10 },
    sections: [{ id: "s1", title: "Finance", body: "", order: 1 }], createdBy: "sec",
  } as Parameters<typeof createMinutes>[0]);
  const base = m.textUpdatedAt;
  check("a new set of minutes has a textUpdatedAt", typeof base, "string");
  const text = (body: string) => ({ title: m.title, body: m.body, period: m.period, sections: [{ id: "s1", title: "Finance", body }] });

  await new Promise((r) => setTimeout(r, 5));
  const first = await patch(m.id, { ...text("Tab A's words"), baseTextUpdatedAt: base });
  const firstBody = await first.json();
  check("first save from the shared base: saved", first.status, 200);
  check("its textUpdatedAt moved", firstBody.textUpdatedAt > (base ?? ""), true);
  check("and the response is shaped like GET (documentRef)", typeof firstBody.documentRef, "string");

  const second = await patch(m.id, { ...text("Tab B's words"), baseTextUpdatedAt: base });
  const secondBody = await second.json();
  check("second save from the OLD base: refused 409", second.status, 409);
  check("marked as a conflict, carrying their record", [secondBody.conflict, secondBody.current?.sections?.[0]?.body], [true, "Tab A's words"]);
  check("tab A's words are still what is stored", (await getMinutes(m.id))?.sections[0].body, "Tab A's words");

  const same = await patch(m.id, { ...text("Tab A's words"), baseTextUpdatedAt: firstBody.textUpdatedAt });
  const sameBody = await same.json();
  check("saving the same words again: textUpdatedAt does not move", sameBody.textUpdatedAt, firstBody.textUpdatedAt);

  await updateMinutes(m.id, { draftNumber: 5 });
  const afterWorkflow = await getMinutes(m.id);
  check("a workflow write (not the words) leaves textUpdatedAt alone", afterWorkflow?.textUpdatedAt, firstBody.textUpdatedAt);
  const afterReview = await patch(m.id, { ...text("Tab A, more"), baseTextUpdatedAt: firstBody.textUpdatedAt });
  check("so the editor can still save after it", afterReview.status, 200);

  const noBase = await patch(m.id, { ...text("Old client, no base") });
  check("a save without a base (older page) still goes through", noBase.status, 200);

  console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
