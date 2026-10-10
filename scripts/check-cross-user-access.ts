// User A creates a record; user B, an ordinary member of the SAME school,
// tries to read, change and delete it. Every attempt must be refused with 403
// or 404, and the record must come out unchanged.
//
// Drives the REAL route handlers with signed session cookies, against an
// in-memory copy of the blob store (scripts/fake-blob/vercel-blob.cjs), so it can never touch
// a real school:
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-cross-user-access.ts
//
// Positive controls run too: A must be able to read their own record, or a
// test where every request fails would "pass".

export {};

// Before any app module loads: no real store, no real email, no real AI.
for (const k of ["BLOB_READ_WRITE_TOKEN", "CONTROL_BLOB_READ_WRITE_TOKEN", "RESEND_API_KEY", "ANTHROPIC_API_KEY", "TENANT_SECRET", "MULTI_TENANT"]) {
  delete process.env[k];
}
process.env.AUTH_SECRET = "cross-user-test-secret";
process.env.NEXT_PUBLIC_SCHOOL ||= "hvps";

const HOST = "school.test";
let failures = 0;

async function main() {
  // Checked through require, the path the app code itself loads modules by.
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
  const { getSpendById } = await import("../lib/spendData");
  const { key: tenantKey } = await tenantScope();

  await saveRoles(DEFAULT_ROLES);
  const member = (id: string, name: string) =>
    createUser({ id, name, surname: "Tester", email: `${id}@example.test`, password: "pw-" + id, role: "sgb-member", forcePasswordChange: false, tagIds: [] });
  const userA = await member("user-a", "Alice");
  const userB = await member("user-b", "Bob");
  const cookie = (u: { id: string; password: string }) => `${SESSION_COOKIE}=${createSessionToken(u, tenantKey)}`;

  type Body = { json?: unknown; form?: Record<string, string> };
  function request(as: { id: string; password: string }, method: string, path: string, body?: Body) {
    const headers: Record<string, string> = { cookie: cookie(as), host: HOST, origin: `http://${HOST}` };
    let payload: BodyInit | undefined;
    if (body?.json !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body.json);
    } else if (body?.form) {
      const fd = new FormData();
      for (const [k, v] of Object.entries(body.form)) fd.append(k, v);
      payload = fd;
    }
    return new NextRequest(`http://${HOST}${path}`, { method, headers, body: payload });
  }
  const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

  // --- A creates a spend application through the real route ---
  const spendRoute = await import("../app/api/spend/route");
  const created = await spendRoute.POST(
    request(userA, "POST", "/api/spend", {
      form: { projectName: "Alice's new netball posts", description: "Two sets of posts", estimatedAmount: "4200", budgeted: "yes", sourceOfFunds: "Fundraising" },
    })
  );
  const createdBody = await created.json();
  const id: string = createdBody.id || createdBody.application?.id || createdBody.spend?.id;
  console.log(`User A (${userA.email}) created spend application ${id}: HTTP ${created.status}`);
  if (created.status >= 300 || !id) {
    console.error("Setup failed: A could not create the record.", createdBody);
    process.exit(1);
  }
  const before = JSON.stringify(await getSpendById(id));

  // A second one, big enough to need a decision, so the approve route is also
  // tried on an application that is still waiting (4 200 is approved on
  // submission: it falls in the log-only band).
  const pendingRes = await spendRoute.POST(
    request(userA, "POST", "/api/spend", {
      form: { projectName: "Alice's new scoreboard", description: "Electronic scoreboard", estimatedAmount: "7000", budgeted: "yes", sourceOfFunds: "Fundraising" },
    })
  );
  const pendingId: string = (await pendingRes.json()).id;
  const pendingBefore = JSON.stringify(await getSpendById(pendingId));
  console.log(`User A created a second application ${pendingId} (${JSON.parse(pendingBefore).status}): HTTP ${pendingRes.status}`);

  // --- the routes that touch one application ---
  const R = {
    item: await import("../app/api/spend/[id]/route"),
    approve: await import("../app/api/spend/[id]/approve/route"),
    complete: await import("../app/api/spend/[id]/complete/route"),
    custodian: await import("../app/api/spend/[id]/custodian/route"),
    notes: await import("../app/api/spend/[id]/notes/route"),
    progress: await import("../app/api/spend/[id]/progress/route"),
    remind: await import("../app/api/spend/[id]/remind/route"),
    selectQuote: await import("../app/api/spend/[id]/select-quote/route"),
    status: await import("../app/api/spend/[id]/status/route"),
    quote: await import("../app/api/spend/[id]/quote/[num]/route"),
  };
  const p = `/api/spend/${id}`;

  // Positive controls: the owner gets in.
  console.log("\nControl: user A, the owner");
  const control = async (label: string, res: Response) => {
    const ok = res.status === 200;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(44)} ${res.status}${ok ? "" : "  (expected 200)"}`);
  };
  await control("A reads own application   GET   " + "/spend/[id]", await R.item.GET(request(userA, "GET", p), ctx({ id })));
  await control("A reads own notes         GET   " + "/notes", await R.notes.GET(request(userA, "GET", `${p}/notes`), ctx({ id })));

  // Every attempt by B. Bodies are VALID, so a refusal cannot be a 400 for a
  // malformed request standing in for a real permission check.
  const attempts: [string, string, () => Promise<Response>][] = [
    ["read", "GET    /api/spend/[id]", () => R.item.GET(request(userB, "GET", p), ctx({ id }))],
    ["read", "GET    /api/spend/[id]/notes", () => R.notes.GET(request(userB, "GET", `${p}/notes`), ctx({ id }))],
    ["read", "GET    /api/spend/[id]/quote/1", () => R.quote.GET(request(userB, "GET", `${p}/quote/1`), ctx({ id, num: "1" }))],
    ["update", "PUT    /api/spend/[id]", () => R.item.PUT(request(userB, "PUT", p, { form: { projectName: "Bob was here", description: "changed", estimatedAmount: "1", budgeted: "no", sourceOfFunds: "Other" } }), ctx({ id }))],
    ["update", "PATCH  /api/spend/[id]/status", () => R.status.PATCH(request(userB, "PATCH", `${p}/status`, { json: { status: "cancelled" } }), ctx({ id }))],
    ["update", "PATCH  /api/spend/[id]/progress", () => R.progress.PATCH(request(userB, "PATCH", `${p}/progress`, { json: { progress: "completed" } }), ctx({ id }))],
    ["update", "PATCH  /api/spend/[id]/custodian", () => R.custodian.PATCH(request(userB, "PATCH", `${p}/custodian`, { json: { custodianUserId: userB.id } }), ctx({ id }))],
    ["update", "POST   /api/spend/[id]/notes", () => R.notes.POST(request(userB, "POST", `${p}/notes`, { json: { body: "Bob's note" } }), ctx({ id }))],
    ["update", "POST   /api/spend/[id]/approve", () => R.approve.POST(request(userB, "POST", `${p}/approve`, { json: { decision: "approved", comment: "ok" } }), ctx({ id }))],
    ["update", "POST   /api/spend/[id]/approve (override)", () => R.approve.POST(request(userB, "POST", `${p}/approve`, { json: { forceApprove: true, comments: "Bob overriding the approvers" } }), ctx({ id }))],
    ["update", "POST   /approve on the waiting one", () => R.approve.POST(request(userB, "POST", `/api/spend/${pendingId}/approve`, { json: { decision: "approved", comments: "ok" } }), ctx({ id: pendingId }))],
    ["update", "POST   /approve override, waiting one", () => R.approve.POST(request(userB, "POST", `/api/spend/${pendingId}/approve`, { json: { forceApprove: true, comments: "Bob overriding the approvers" } }), ctx({ id: pendingId }))],
    ["update", "POST   /api/spend/[id]/select-quote", () => R.selectQuote.POST(request(userB, "POST", `${p}/select-quote`, { json: { quoteIndex: 0 } }), ctx({ id }))],
    ["update", "POST   /api/spend/[id]/complete", () => R.complete.POST(request(userB, "POST", `${p}/complete`, { json: { actualAmount: 1 } }), ctx({ id }))],
    ["update", "POST   /api/spend/[id]/remind", () => R.remind.POST(request(userB, "POST", `${p}/remind`, { json: { message: "hi" } }), ctx({ id }))],
    ["delete", "DELETE /api/spend/[id]", () => R.item.DELETE(request(userB, "DELETE", p), ctx({ id }))],
  ];

  console.log(`\nUser B (${userB.email}), same school, same role, not the owner`);
  for (const [kind, label, run] of attempts) {
    const res = await run();
    const ok = res.status === 403 || res.status === 404;
    if (!ok) failures++;
    let why = "";
    if (!ok) why = "  " + JSON.stringify(await res.clone().json().catch(() => ""));
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${kind.padEnd(7)}${label.padEnd(42)} ${res.status}${ok ? "" : "  (expected 403/404)"}${why}`);
  }

  // B's list must not show it either.
  const list = await spendRoute.GET(request(userB, "GET", "/api/spend"));
  const rows = (await list.json()) as { id: string }[];
  const leaked = Array.isArray(rows) && rows.some((r) => r.id === id);
  if (leaked) failures++;
  console.log(`  ${leaked ? "FAIL" : "PASS"}  list   GET    /api/spend (B's list)            ${list.status}, ${leaked ? "INCLUDES A's application" : "A's application not in it"}`);

  // And nothing B did changed it.
  const after = JSON.stringify(await getSpendById(id));
  const same = after === before && JSON.stringify(await getSpendById(pendingId)) === pendingBefore;
  if (!same) failures++;
  console.log(`\n  ${same ? "PASS" : "FAIL"}  both of A's applications are byte-for-byte unchanged after B's attempts`);

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
