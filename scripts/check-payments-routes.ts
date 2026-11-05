// Payment approvals through the REAL routes: who may do what, contacts and
// proof, loading invoices and bank files (the AI answered by a local stub),
// signing, the release tick and every status change on the way to Paid.
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-payments-routes.ts
import http from "node:http";
import type { AddressInfo } from "node:net";

process.env.AUTH_SECRET ||= "check-payments-routes-secret";
process.env.ANTHROPIC_API_KEY = "stub";
for (const k of ["BLOB_READ_WRITE_TOKEN", "CONTROL_BLOB_READ_WRITE_TOKEN", "MULTI_TENANT"]) delete process.env[k];
process.env.NEXT_PUBLIC_SCHOOL ||= "hvps";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`);
}

// The next answer the "AI" gives, as a streamed Messages response.
let aiAnswer: unknown = {};
const sse = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
const stub = http.createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(
      sse("message_start", { message: { id: "m", type: "message", role: "assistant", model: "stub", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 3000, output_tokens: 1 } } }) +
        sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }) +
        sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: JSON.stringify(aiAnswer) } }) +
        sse("content_block_stop", { index: 0 }) +
        sse("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 400 } }) +
        sse("message_stop", {})
    );
  });
});

const pdf = (body: string) => new File([`%PDF-1.7 ${body}`], `${body}.pdf`, { type: "application/pdf" });
const PNG_MARK = "data:image/png;base64,iVBORw0KGgo=";

async function main() {
  await new Promise<void>((r) => stub.listen(0, "127.0.0.1", r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;

  const { createRequire } = await import("module");
  const blob = createRequire(__filename)("@vercel/blob") as { __fakeStore?: () => unknown };
  if (typeof blob.__fakeStore !== "function") {
    console.error("Refusing to run: @vercel/blob is the REAL store.");
    process.exit(1);
  }

  const { NextRequest } = await import("next/server");
  const { saveRoles } = await import("../lib/rolesData");
  const { DEFAULT_ROLES } = await import("../lib/roles");
  const { createUser, updateUser } = await import("../lib/userData");
  const { createTag } = await import("../lib/tagData");
  const { createSessionToken, SESSION_COOKIE } = await import("../lib/session");
  const { tenantScope } = await import("../lib/tenantContext");
  const { addCredits, getCredits } = await import("../lib/contentTranslation");

  const contacts = await import("../app/api/payments/contacts/route");
  const contact = await import("../app/api/payments/contacts/[id]/route");
  const invoices = await import("../app/api/payments/invoices/route");
  const invoice = await import("../app/api/payments/invoices/[id]/route");
  const sign = await import("../app/api/payments/invoices/[id]/sign/route");
  const release = await import("../app/api/payments/invoices/[id]/release/route");
  const screens = await import("../app/api/payments/screens/route");
  const files = await import("../app/api/payments/files/[kind]/[id]/route");
  const settings = await import("../app/api/payments/settings/route");

  const { key: tenantKey } = await tenantScope();
  await saveRoles([
    ...DEFAULT_ROLES,
    { id: "clerk", name: "Clerk", permissions: ["manage_payments"] },
    { id: "signer", name: "Signer", permissions: ["view_payments"] },
    { id: "nobody", name: "Nobody", permissions: [] },
  ]);
  const make = (id: string, role: string, tagIds: string[] = []) =>
    createUser({ id, name: id, surname: "T", email: `${id}@example.test`, password: `pw-${id}`, role, forcePasswordChange: false, tagIds });
  await createTag({ id: "principal", name: "Principal" } as never);
  await createTag({ id: "sgb", name: "SGB" } as never);
  const admin = await make("admin", "super-admin");
  const clerk = await make("clerk", "clerk");
  const principal = await make("pat", "signer", ["principal"]);
  const sgb = await make("sam", "signer", ["sgb"]);
  const stranger = await make("stray", "nobody");
  await updateUser(clerk.id, { canSpendTranslationCredits: true });
  await addCredits(5);

  type U = { id: string; password: string };
  const headers = (u: U) => ({ cookie: `${SESSION_COOKIE}=${createSessionToken(u, tenantKey)}`, host: "school.test" });
  const req = (u: U, url: string, method = "GET", body?: BodyInit) => new NextRequest(`http://school.test${url}`, { method, body, headers: headers(u) });
  const json = (u: U, url: string, method: string, body: unknown) =>
    new NextRequest(`http://school.test${url}`, { method, body: JSON.stringify(body), headers: { ...headers(u), "content-type": "application/json" } });
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const form = (fields: Record<string, string | File>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };
  const inbox = async (u: U) => (await invoices.GET(req(u, "/api/payments/invoices"))).json();
  const load = (u: U, file: File) => invoices.POST(req(u, "/api/payments/invoices", "POST", form({ file })));
  const statusOf = async (id: string) => (await inbox(clerk)).rows.find((r: { id: string }) => r.id === id);

  // --- Contacts
  const acme = { type: "creditor", name: "Acme Supplies (Pty) Ltd", bank: { bankName: "FNB", accountHolder: "Acme Supplies", accountNumber: "62012345678", branchCode: "250655" } };
  check("a stranger cannot see contacts", (await contacts.GET(req(stranger, "/x"))).status, 403);
  check("a signer cannot see whole bank details", (await contacts.GET(req(principal, "/x"))).status, 403);
  check("creditor without proof refused", (await contacts.POST(req(clerk, "/x", "POST", form({ contact: JSON.stringify(acme) })))).status, 400);
  check("rubbish instead of a contact refused", (await contacts.POST(req(clerk, "/x", "POST", form({ contact: "{not json" })))).status, 400);
  check("an SVG as proof refused", (await contacts.POST(req(clerk, "/x", "POST", form({ contact: JSON.stringify(acme), file: new File(["<svg/>"], "p.png") })))).status, 415);
  const created = await contacts.POST(req(clerk, "/x", "POST", form({ contact: JSON.stringify(acme), file: pdf("proof") })));
  check("creditor with proof saved", created.status, 201);
  const acmeId = (await created.json()).id;
  const moved = { ...acme, bank: { ...acme.bank, accountNumber: "99999999999" } };
  check("new account without new proof refused", (await contact.PUT(req(clerk, "/x", "PUT", form({ contact: JSON.stringify(moved) })), ctx(acmeId))).status, 400);
  check("tidying the name needs no proof", (await contact.PUT(req(clerk, "/x", "PUT", form({ contact: JSON.stringify({ ...acme, address: "Rosebank" }) })), ctx(acmeId))).status, 200);
  check("proof opens for the clerk", (await files.GET(req(clerk, "/x"), { params: Promise.resolve({ kind: "proof", id: acmeId }) })).headers.get("content-type"), "application/pdf");
  check("proof closed to a signer", (await files.GET(req(principal, "/x"), { params: Promise.resolve({ kind: "proof", id: acmeId }) })).status, 403);

  // --- Loading an invoice
  aiAnswer = { supplierName: "ACME SUPPLIES", supplierVat: "", supplierReg: "", invoiceNumber: "INV-1", invoiceDate: "2026-11-01", amountDue: 1000, accountNumber: "62012345678", branchCode: "250655" };
  check("a signer cannot load", (await load(principal, pdf("a"))).status, 403);
  check("an admin not ticked to spend cannot load", (await load(admin, pdf("a"))).status, 403);
  const before = await getCredits();
  const loaded = await load(clerk, pdf("inv1"));
  check("invoice loaded", loaded.status, 201);
  const inv = (await loaded.json()).id;
  check("charged the actual cost", await getCredits(), before - 0.1);
  check("the same file again refused free", [(await load(clerk, pdf("inv1"))).status, await getCredits()], [409, before - 0.1]);
  aiAnswer = { supplierName: "", amountDue: null };
  check("not an invoice: refused and free", [(await load(clerk, pdf("menu"))).status, await getCredits()], [422, before - 0.1]);
  let row = await statusOf(inv);
  check("green bank tick, grey amount, Pending approval", [row.bank.status, row.amount.status, row.status], ["match", "unknown", "pending_approval"]);
  check("invoice opens inline", (await files.GET(req(principal, "/x"), { params: Promise.resolve({ kind: "invoice", id: inv }) })).headers.get("content-disposition")?.startsWith("inline"), true);
  check("invoice closed to a stranger", (await files.GET(req(stranger, "/x"), { params: Promise.resolve({ kind: "invoice", id: inv }) })).status, 403);
  check("a bad release body undoes nothing", (await release.POST(json(clerk, "/x", "POST", {}), ctx(inv))).status, 400);
  check("an unknown file kind is not found", (await files.GET(req(clerk, "/x"), { params: Promise.resolve({ kind: "secrets", id: inv }) })).status, 404);

  // --- Bank screen
  aiAnswer = { payments: [{ payee: "ACME SUPPLIES", amount: 1000, accountNumber: "62012345678", branchCode: "", reference: "INV-1" }, { payee: "Someone Else", amount: 50, accountNumber: "", branchCode: "", reference: "" }] };
  const screenRes = await screens.POST(req(clerk, "/api/payments/screens", "POST", form({ file: new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1])], "bank.jpg") })));
  check("bank screen loaded", screenRes.status, 201);
  row = await statusOf(inv);
  check("amount green, Pending signatures", [row.amount.status, row.status], ["match", "pending_signatures"]);
  check("the other payment shows with a grey question mark", (await inbox(clerk)).unmatched.map((u: { payee: string; check: { status: string } }) => [u.payee, u.check.status]), [["Someone Else", "unknown"]]);

  // --- Who signs
  check("nobody can sign before tags are chosen", (await sign.POST(json(principal, "/x", "POST", { dataUrl: PNG_MARK }), ctx(inv))).status, 403);
  check("a clerk cannot choose the tags", (await settings.PUT(json(clerk, "/x", "PUT", { signerTagIds: ["principal"] }))).status, 403);
  check("a bad body clears nobody", (await settings.PUT(json(admin, "/x", "PUT", {}))).status, 400);
  check("an admin chooses them, junk ignored", await (await settings.PUT(json(admin, "/x", "PUT", { signerTagIds: ["principal", "sgb", "made-up"] }))).json(), { signerTagIds: ["principal", "sgb"] });
  check("Super Admin with no tag cannot sign", (await sign.POST(json(admin, "/x", "POST", { dataUrl: PNG_MARK }), ctx(inv))).status, 403);
  check("a page-sized picture is no signature", (await sign.POST(json(principal, "/x", "POST", { dataUrl: "x" }), ctx(inv))).status, 400);
  check("release before signing refused", (await release.POST(json(principal, "/x", "POST", { released: true }), ctx(inv))).status, 409);

  check("first signature", (await sign.POST(json(principal, "/x", "POST", { dataUrl: PNG_MARK }), ctx(inv))).status, 201);
  check("Signed by one", (await statusOf(inv)).status, "signed_one");
  check("nobody signs twice", (await sign.POST(json(principal, "/x", "POST", { dataUrl: PNG_MARK }), ctx(inv))).status, 409);
  check("a signed invoice cannot be deleted", (await invoice.DELETE(req(clerk, "/x", "DELETE"), ctx(inv))).status, 409);
  await sign.POST(json(sgb, "/x", "POST", { dataUrl: PNG_MARK }), ctx(inv));
  check("Signed by all", (await statusOf(inv)).status, "signed_all");
  check("signatures come back with the marks", (await (await sign.GET(req(clerk, "/x"), ctx(inv))).json()).map((s: { name: string; dataUrl: string }) => [s.name, s.dataUrl]), [["pat T", PNG_MARK], ["sam T", PNG_MARK]]);

  // --- Released, then Paid
  await release.POST(json(principal, "/x", "POST", { released: true }), ctx(inv));
  check("Released by one", (await statusOf(inv)).status, "released_one");
  await release.POST(json(sgb, "/x", "POST", { released: true }), ctx(inv));
  check("Released by all", (await statusOf(inv)).status, "released_all");
  await release.POST(json(sgb, "/x", "POST", { released: false }), ctx(inv));
  check("a tick can be taken back", (await statusOf(inv)).status, "released_one");
  aiAnswer = { payments: [{ date: "2026-11-04", payee: "FNB APP PAYMENT ACME SUPP", amount: 1000, reference: "" }, { date: "2026-11-04", payee: "SALARIES", amount: 90000, reference: "" }] };
  const statementRes = await screens.POST(req(clerk, "/api/payments/screens?kind=statement", "POST", form({ file: pdf("statement") })));
  check("statement loaded", statementRes.status, 201);
  const statementId = (await statementRes.json()).id;
  row = await statusOf(inv);
  check("Paid, with the date", [row.status, row.paidOn], ["paid", "2026-11-04"]);
  check("a statement line never shows as a bank payment with no invoice", (await inbox(clerk)).unmatched.length, 1);
  check("the statement is closed to a signer", (await files.GET(req(principal, "/x"), { params: Promise.resolve({ kind: "screen", id: statementId }) })).status, 403);
  check("and open to the clerk", (await files.GET(req(clerk, "/x"), { params: Promise.resolve({ kind: "screen", id: statementId }) })).status, 200);

  // --- A red check needs a reason
  aiAnswer = { supplierName: "Acme Supplies", invoiceNumber: "INV-2", invoiceDate: "2026-11-02", amountDue: 200, accountNumber: "11111111111", branchCode: "" };
  const redId = (await (await load(clerk, pdf("inv2"))).json()).id;
  check("changed bank details: red", (await statusOf(redId)).bank.detail, "...1111 / ...5678");
  check("cannot sign a red invoice without the tick", (await sign.POST(json(principal, "/x", "POST", { dataUrl: PNG_MARK }), ctx(redId))).status, 409);
  check("can with it", (await sign.POST(json(principal, "/x", "POST", { dataUrl: PNG_MARK, override: true }), ctx(redId))).status, 201);
  check("and it says so", (await (await sign.GET(req(clerk, "/x"), ctx(redId))).json())[0].override, true);

  // --- Grey needs the same tick
  aiAnswer = { supplierName: "Nobody On The List", invoiceNumber: "INV-9", invoiceDate: "2026-11-02", amountDue: 300, accountNumber: "22222222222", branchCode: "" };
  const greyId = (await (await load(clerk, pdf("inv9"))).json()).id;
  check("cannot sign a grey invoice without the tick", (await sign.POST(json(principal, "/x", "POST", { dataUrl: PNG_MARK }), ctx(greyId))).status, 409);

  // --- A deleted signing tag
  const { deleteTag } = await import("../lib/tagData");
  await deleteTag("sgb");
  check("a deleted tag stops counting", (await (await settings.GET(req(admin, "/x"))).json()).signerTagIds, ["principal"]);

  // --- Out of credits
  await addCredits(-(await getCredits()));
  check("no credits: told, not charged", (await load(clerk, pdf("inv3"))).status, 402);

  // --- Removing
  aiAnswer = { supplierName: "Acme", amountDue: 1 };
  await addCredits(1);
  const spare = (await (await load(clerk, pdf("inv4"))).json()).id;
  check("an unsigned invoice can be deleted", (await invoice.DELETE(req(clerk, "/x", "DELETE"), ctx(spare))).status, 200);
  check("and its file goes with it", (await files.GET(req(clerk, "/x"), { params: Promise.resolve({ kind: "invoice", id: spare }) })).status, 404);

  stub.close();
  console.log(failures ? `\n${failures} FAILED` : "\ncheck-payments-routes: all passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
