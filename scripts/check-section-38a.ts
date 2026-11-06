// Section 38A through the REAL routes: who may do what, the list, signing by
// link, a change voiding a signature, lodging, the letter and the decisions.
// Also the dates and the entry rules. The email is the only thing not real.
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-section-38a.ts
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

process.env.AUTH_SECRET ||= "check-section-38a-secret";
for (const k of ["BLOB_READ_WRITE_TOKEN", "CONTROL_BLOB_READ_WRITE_TOKEN", "MULTI_TENANT", "RESEND_API_KEY"]) delete process.env[k];
process.env.NEXT_PUBLIC_SCHOOL ||= "hvps";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PERSON = {
  name: "Nomsa", surname: "Dlamini", email: "nomsa@example.com", persal: "12345678", rank: "Educator", benefit: "remuneration", activities: ["sport"],
  description: "Head of hockey: coaching, weekend fixtures.", times: ["weekends"], timesOther: "", pay: "monthly", amount: 2000, hours: 0, details: "",
  stateNotPaying: true, noInterference: true, coreActivity: true,
};

(async () => {
  const { createRequire } = await import("module");
  const blob = createRequire(__filename)("@vercel/blob") as { __fakeStore?: () => unknown };
  assert.equal(typeof blob.__fakeStore, "function", "refuses to run on the real store");

  const lib = await import("../lib/section38a");
  const data = await import("../lib/section38aData");

  // --- Dates and sums ---
  assert.equal(lib.lodgeBy("2026-11-30"), "2026-07-30");
  assert.equal(lib.lodgeBy("2026-10-31"), "2026-06-30", "a shorter month clamps");
  assert.equal(lib.decisionDue("2026-07-28"), "2026-10-28");
  assert.equal(lib.decisionDue("2026-11-30"), "2027-02-28", "over the year end");
  assert.equal(lib.yearMax({ pay: "monthly", amount: 2000, hours: 0 }), 24000);
  assert.equal(lib.yearMax({ pay: "hourly", amount: 150.5, hours: 40 }), 6020);
  assert.equal(lib.yearMax({ pay: "once", amount: 900, hours: 0 }), 900);
  assert.equal(lib.isDate("2026-02-30"), false);

  // --- Entry rules ---
  const bad = (change: object) => typeof lib.cleanEntry({ ...PERSON, ...change }) === "string";
  assert.ok(!bad({}), "a good entry passes");
  assert.ok(bad({ description: Array(31).fill("word").join(" ") }), "31 words refused");
  assert.ok(bad({ persal: "12a" }), "PERSAL must be digits");
  assert.ok(bad({ amount: 0 }), "no rand value refused, so a benefit in kind always has one");
  assert.ok(bad({ pay: "hourly", hours: 0 }), "hourly needs hours");
  assert.ok(bad({ coreActivity: false }), "all three confirmations");
  assert.ok(bad({ benefit: "bonus" }), "bonus is not a type");
  assert.ok(bad({ times: ["other"], timesOther: "" }), "other time needs words");

  // --- Terms ---
  const year = { ...lib.emptyYear(2027), people: [{ ...PERSON, id: "a" } as never] };
  assert.ok(lib.overview({ ...year, people: [{ ...PERSON, id: "a", description: "A bonus for hockey" } as never] }, "2026-06-01").wordsToCheck.length === 1, "bonus warns");
  assert.equal(lib.overview(year, "2026-08-01").late, true);
  assert.equal(lib.overview(year, "2026-07-01").late, false);

  // --- Routes ---
  const { saveRoles } = await import("../lib/rolesData");
  const { DEFAULT_ROLES } = await import("../lib/roles");
  const { createUser } = await import("../lib/userData");
  const { createSessionToken, SESSION_COOKIE } = await import("../lib/session");
  const { tenantScope } = await import("../lib/tenantContext");
  const { key: tenantKey } = await tenantScope();
  await saveRoles([...DEFAULT_ROLES, { id: "s38", name: "S38", permissions: ["manage_section_38a"] }, { id: "viewer", name: "Viewer", permissions: ["view_payments"] }]);
  type U = { id: string; password: string };
  const make = (id: string, role: string): Promise<U> => createUser({ id, name: id, surname: "T", email: `${id}@example.test`, password: `pw-${id}`, role, forcePasswordChange: false, tagIds: [] }) as Promise<U>;
  const admin = await make("admin", "s38");
  const other = await make("other", "viewer");
  const main = await import("../app/api/section-38a/[year]/route");
  const people = await import("../app/api/section-38a/[year]/people/route");
  const person = await import("../app/api/section-38a/[year]/people/[id]/route");
  const lodge = await import("../app/api/section-38a/[year]/lodge/route");
  const pack = await import("../app/api/section-38a/[year]/pack/route");
  const decision = await import("../app/api/section-38a/[year]/decision/route");
  const send = await import("../app/api/section-38a/[year]/send/route");
  const pub = await import("../app/api/public/section-38a/[token]/route");

  const call = async (who: U | null, url: string, method: string, body?: unknown) =>
    new NextRequest(`http://school.test${url}`, {
      method,
      headers: { "Content-Type": "application/json", host: "school.test", ...(who ? { cookie: `${SESSION_COOKIE}=${createSessionToken(who, tenantKey)}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const Y = { params: Promise.resolve({ year: "2027" }) };

  assert.equal((await main.GET(await call(other, "/api/section-38a/2027", "GET"), Y)).status, 403, "another key is refused");
  assert.equal((await main.GET(await call(null, "/api/section-38a/2027", "GET"), Y)).status, 401, "signed out is refused");
  assert.equal((await main.GET(await call(admin, "/api/section-38a/1999", "GET"), { params: Promise.resolve({ year: "1999" }) })).status, 400);

  const add = await people.POST(await call(admin, "/api/section-38a/2027/people", "POST", PERSON), Y);
  assert.equal(add.status, 201);
  const { id } = await add.json();

  // The link is minted here directly: sending is the same call plus the email.
  const { token, link } = data.mintLink(2027, id, { name: "Admin", email: "admin@example.com" });
  await data.changeYear(2027, (y) => ({ ...y, province: "Gauteng", people: y.people.map((e) => ({ ...e, link })) }));

  const T = { params: Promise.resolve({ token }) };
  const seen = await (await pub.GET(await call(null, `/api/public/section-38a/${token}`, "GET"), T)).json();
  assert.equal(seen.kind, "employee");
  assert.equal(seen.entry.max, 24000);
  assert.ok(seen.undertaking.intro.includes("Gauteng Department of Education"));
  assert.ok(!JSON.stringify(seen).includes(link.hash), "no hash reaches the signer");

  const wrong = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
  assert.equal((await pub.GET(await call(null, `/api/public/section-38a/${wrong}`, "GET"), { params: Promise.resolve({ token: wrong }) })).status, 404, "a wrong secret opens nothing");
  assert.equal((await pub.POST(await call(null, "/x", "POST", { dataUrl: "junk", terms: seen.terms }), T)).status, 400, "a bad mark is refused");
  assert.equal((await pub.POST(await call(null, "/x", "POST", { dataUrl: PNG, terms: "old" }), T)).status, 409, "terms not the ones on screen");
  assert.equal((await pub.POST(await call(null, "/x", "POST", { dataUrl: PNG, kind: "drawn", terms: seen.terms }), T)).status, 201);

  let read = await (await main.GET(await call(admin, "/api/section-38a/2027", "GET"), Y)).json();
  assert.equal(read.year.people[0].status, "signed");
  assert.equal(read.overview.signed, 1);
  const raw = JSON.stringify(read);
  assert.ok(!raw.includes(link.hash) && !raw.includes("iVBOR"), "no hash or mark reaches the admin page");

  // A change voids the signature.
  const P = { params: Promise.resolve({ year: "2027", id }) };
  assert.equal((await person.PUT(await call(admin, "/x", "PUT", { ...PERSON, amount: 2500 }), P)).status, 200);
  read = await (await main.GET(await call(admin, "/api/section-38a/2027", "GET"), Y)).json();
  assert.equal(read.year.people[0].status, "changed");
  assert.equal(read.overview.signed, 0);
  const again = await (await pub.GET(await call(null, "/x", "GET"), T)).json();
  assert.equal((await pub.POST(await call(null, "/x", "POST", { dataUrl: PNG, terms: again.terms }), T)).status, 201, "the same link signs the new terms");

  assert.equal((await send.POST(await call(admin, "/x", "POST", { target: "sgb" }), Y)).status, 400, "a chair cannot be sent to before the SGB has approved");

  // Lodging waits for everything.
  const notReady = await lodge.POST(await call(admin, "/x", "POST", { date: "2026-07-01" }), Y);
  assert.equal(notReady.status, 409);
  assert.match((await notReady.json()).error, /Both chairs/);
  assert.equal((await lodge.POST(await call(admin, "/x", "POST", { date: "2099-01-01" }), Y)).status, 400, "a future date is refused");

  const setup = { budgetDate: "2026-11-30", province: "Gauteng", district: "D9", emis: "700000000", budgetLine: 50000, sources: ["fees"], policyId: "", sgbTagId: "", financeTagId: "", approval: { meetingDate: "2026-07-14", item: "item 6", steppedOut: "", sections20: true, funds: true, affordable: true } };
  assert.equal((await main.PUT(await call(admin, "/x", "PUT", setup), Y)).status, 200);
  const chair = async (line: "sgb" | "finance", name: string) => {
    const made = data.mintLink(2027, line, { name: "Admin", email: "admin@example.com" });
    await data.changeYear(2027, (y) => ({ ...y, policyId: "p1", chairs: { ...y.chairs, [line]: { name, email: `${line}@example.com`, link: made.link } } }));
    const C = { params: Promise.resolve({ token: made.token }) };
    const v = await (await pub.GET(await call(null, "/x", "GET"), C)).json();
    assert.equal(v.kind, "chair");
    assert.ok(v.undertaking.intro.includes("School Governing Body"));
    assert.equal((await pub.POST(await call(null, "/x", "POST", { dataUrl: PNG, terms: v.terms }), C)).status, 201);
  };
  await chair("sgb", "Chair One");
  await chair("finance", "Chair Two");

  read = await (await main.GET(await call(admin, "/api/section-38a/2027", "GET"), Y)).json();
  assert.equal(read.overview.chairsSigned, 2);
  assert.deepEqual(read.overview.gaps, []);

  const pdf = await pack.GET(await call(admin, "/x", "GET"), Y);
  assert.equal(pdf.status, 200);
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), "%PDF");

  assert.equal((await lodge.POST(await call(admin, "/x", "POST", { date: "2026-07-20", how: "By hand", reference: "" }), Y)).status, 200);
  assert.equal((await person.PUT(await call(admin, "/x", "PUT", PERSON), P)).status, 409, "lodged locks the list");
  assert.equal((await person.DELETE(await call(admin, "/x", "DELETE"), P)).status, 409);
  assert.equal((await main.PUT(await call(admin, "/x", "PUT", setup), Y)).status, 409, "lodged locks the setup");
  assert.equal((await pub.POST(await call(null, "/x", "POST", { dataUrl: PNG, terms: again.terms }), T)).status, 409, "no signing after lodging");

  // Nobody is approved without the letter.
  assert.equal((await decision.PUT(await call(admin, "/x", "PUT", { id, decision: "approved" }), Y)).status, 409);
  await data.changeYear(2027, (y) => ({ ...y, letter: { name: "hod.pdf", ext: "pdf", at: "2026-09-01", by: "Admin" } }));
  assert.equal((await decision.PUT(await call(admin, "/x", "PUT", { id, decision: "approved" }), Y)).status, 200);
  read = await (await main.GET(await call(admin, "/api/section-38a/2027", "GET"), Y)).json();
  assert.equal(read.overview.approved, 1);
  assert.equal(read.overview.step, lib.STEPS.length, "every step done");
  assert.equal((await lodge.DELETE(await call(admin, "/x", "DELETE"), Y)).status, 409, "decisions hold the lodgement");

  console.log("check-section-38a: all passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
