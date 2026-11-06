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
  const sign = await import("../app/api/payments/screens/[id]/sign/route");
  const codeRoute = await import("../app/api/payments/screens/[id]/code/route");
  const release = await import("../app/api/payments/screens/[id]/release/route");
  const noticePdf = await import("../app/api/payments/screens/[id]/signed/route");
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
  const deputy = await make("pam", "signer", ["principal"]);
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
  const bare = { ...acme, name: "Bare Supplier", bank: { ...acme.bank, accountHolder: "Bare Supplier", accountNumber: "33333333333" } };
  check("creditor without proof is allowed", (await contacts.POST(req(clerk, "/x", "POST", form({ contact: JSON.stringify(bare) })))).status, 201);
  check("rubbish instead of a contact refused", (await contacts.POST(req(clerk, "/x", "POST", form({ contact: "{not json" })))).status, 400);
  check("an SVG as proof refused", (await contacts.POST(req(clerk, "/x", "POST", form({ contact: JSON.stringify(acme), file: new File(["<svg/>"], "p.png") })))).status, 415);
  const created = await contacts.POST(req(clerk, "/x", "POST", form({ contact: JSON.stringify(acme), file: pdf("proof") })));
  check("creditor with proof saved", created.status, 201);
  const acmeId = (await created.json()).id;
  const moved = { ...acme, bank: { ...acme.bank, accountNumber: "99999999999" } };
  const movedId = (await (await contacts.POST(req(clerk, "/x", "POST", form({ contact: JSON.stringify({ ...moved, name: "Moving Co", bank: { ...moved.bank, accountHolder: "Moving Co" } }), file: pdf("proof2") })))).json()).id;
  const movedAgain = { ...moved, name: "Moving Co", bank: { ...moved.bank, accountHolder: "Moving Co", accountNumber: "44444444444" } };
  check("a new account drops the old proof", (await (await contact.PUT(req(clerk, "/x", "PUT", form({ contact: JSON.stringify(movedAgain) })), ctx(movedId))).json()).proof, null);
  check("and its file goes", (await files.GET(req(clerk, "/x"), { params: Promise.resolve({ kind: "proof", id: movedId }) })).status, 404);
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
  check("proof on file: no orange alert", row.noProof, false);
  check("green bank tick, grey amount, Pending approval", [row.bank.status, row.amount.status, row.status], ["match", "unknown", "pending_approval"]);
  check("invoice opens inline", (await files.GET(req(principal, "/x"), { params: Promise.resolve({ kind: "invoice", id: inv }) })).headers.get("content-disposition")?.startsWith("inline"), true);
  check("invoice closed to a stranger", (await files.GET(req(stranger, "/x"), { params: Promise.resolve({ kind: "invoice", id: inv }) })).status, 403);
  check("an unknown file kind is not found", (await files.GET(req(clerk, "/x"), { params: Promise.resolve({ kind: "secrets", id: inv }) })).status, 404);

  // --- Bank screen
  aiAnswer = { payments: [{ payee: "ACME SUPPLIES", amount: 1000, accountNumber: "62012345678", branchCode: "", reference: "INV-1" }, { payee: "Someone Else", amount: 50, accountNumber: "", branchCode: "", reference: "" }] };
  const screenRes = await screens.POST(req(clerk, "/api/payments/screens", "POST", form({ file: new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1])], "bank.jpg") })));
  check("bank screen loaded", screenRes.status, 201);
  const notice = (await screenRes.json()).id as string;
  check("a bad release body undoes nothing", (await release.POST(json(clerk, "/x", "POST", {}), ctx(notice))).status, 400);
  row = await statusOf(inv);
  check("amount green, Pending signatures", [row.amount.status, row.status], ["match", "pending_signatures"]);
  check("the other payment shows with a grey question mark", (await inbox(clerk)).unmatched.map((u: { payee: string; check: { status: string } }) => [u.payee, u.check.status]), [["Someone Else", "unknown"]]);

  // --- Who signs
  const { hashSigningCode } = await import("../lib/minutesSigning");
  const { getNoticeCodes, noticeCodeSalt, saveNoticeCode } = await import("../lib/paymentData");
  const MARK = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const CODE = "ABC234";
  // The real code only goes to a mailbox, so the test files a known one the same way the route does.
  const codeFor = (u: U, id = notice, code = CODE) => saveNoticeCode(id, u.id, hashSigningCode(code, noticeCodeSalt(id, u.id)));
  const signNow = (u: U, extra: object = {}, id = notice) => sign.POST(json(u, "/x", "POST", { dataUrl: MARK, code: CODE, override: true, ...extra }), ctx(id));
  const noticeRow = async () => (await inbox(clerk)).notices.find((n: { id: string }) => n.id === notice);

  check("no code for someone who cannot sign yet", (await codeRoute.POST(req(principal, "/x", "POST"), ctx(notice))).status, 403);
  check("nobody can sign before tags are chosen", (await signNow(principal)).status, 403);
  check("a clerk cannot choose the tags", (await settings.PUT(json(clerk, "/x", "PUT", { signerTagIds: ["principal"] }))).status, 403);
  check("a bad body clears nobody", (await settings.PUT(json(admin, "/x", "PUT", {}))).status, 400);
  check("an admin chooses them, junk ignored", await (await settings.PUT(json(admin, "/x", "PUT", { signerTagIds: ["principal", "sgb", "made-up"] }))).json(), { signerTagIds: ["principal", "sgb"] });
  check("Super Admin with no tag cannot sign", (await signNow(admin)).status, 403);
  check("a page-sized picture is no signature", (await signNow(principal, { dataUrl: "x" })).status, 400);
  check("release before signing refused", (await release.POST(json(principal, "/x", "POST", { released: true }), ctx(notice))).status, 409);
  check("signing a statement: not found", (await codeRoute.POST(req(principal, "/x", "POST"), ctx("no-such"))).status, 404);

  const sent = await codeRoute.POST(req(sgb, "/x", "POST"), ctx(notice));
  const filed = (await getNoticeCodes(notice))[sgb.id];
  check("asking files a keyed hash, and never answers with it", [sent.status === 200 || sent.status === 502, /^[0-9a-f]{64}$/.test(filed?.hash ?? ""), JSON.stringify(await sent.json()).includes(filed?.hash ?? "x")], [true, true, false]);
  check("the inbox never carries a code", JSON.stringify(await inbox(clerk)).includes(filed.hash), false);
  check("no code asked for: refused", (await signNow(principal)).status, 400);
  await codeFor(principal);
  check("the wrong code: refused", (await signNow(principal, { code: "ZZZZZZ" })).status, 400);
  check("someone else's code: refused", (await signNow(sgb)).status, 400);
  check("a payment with no invoice needs the tick", (await signNow(principal, { override: false })).status, 409);
  check("code and tick: signed", (await signNow(principal)).status, 201);
  check("the code is spent", (await getNoticeCodes(notice))[principal.id], undefined);
  let n = await noticeRow();
  check("1 of 2 have signed", [n.status, n.progress.signed, n.progress.required], ["signing", 1, 2]);
  check("names: who signed, who is waited on", n.progress.slots, [
    { label: "Principal", signer: "pat T", approved: false, waitingOn: [] },
    { label: "SGB", signer: "", approved: false, waitingOn: ["sam T"] },
  ]);
  row = await statusOf(inv);
  check("the invoice row follows its notice", [row.status, row.progress.signed, row.signedOnNotice, row.noticeId === notice], ["signing", 1, true, true]);
  check("the signer's second go refused", (await codeRoute.POST(req(principal, "/x", "POST"), ctx(notice))).status, 409);
  check("the same tag cannot sign the same line", (await codeRoute.POST(req(deputy, "/x", "POST"), ctx(notice))).status, 409);
  await codeFor(deputy);
  check("not even with a code in hand", (await signNow(deputy)).status, 409);
  check("an invoice on a signed notice cannot be deleted", (await invoice.DELETE(req(clerk, "/x", "DELETE"), ctx(inv))).status, 409);
  check("a signed notice cannot be removed", (await screens.DELETE(req(clerk, `/api/payments/screens?id=${notice}`, "DELETE"))).status, 409);
  await codeFor(sgb);
  check("second line signed", (await signNow(sgb)).status, 201);
  check("2 of 2 have signed", (await noticeRow()).progress.signed, 2);

  // --- The stamped notice
  const { PDFDocument, degrees } = await import("pdf-lib");
  const { signedNoticePdf } = await import("../lib/paymentSignedPdf");
  check("closed to a stranger", (await noticePdf.GET(req(stranger, "/x"), ctx(notice))).status, 403);
  check("a notice nobody signed has none", (await noticePdf.GET(req(clerk, "/x"), ctx("no-such"))).status, 404);
  const stamped = await noticePdf.GET(req(principal, "/x?download=1"), ctx(notice));
  check("a signer can open it", [stamped.status, stamped.headers.get("content-type"), stamped.headers.get("content-disposition")?.includes("Signed - ")], [200, "application/pdf", true]);
  const stampSlots = [{ tagId: "a", label: "Initiator", members: [] }, { tagId: "b", label: "Principal", members: [] }, { tagId: "c", label: "SGB Representative", members: [] }];
  const stampSig = { userId: "u", name: "Sipho Ndlovu š", at: new Date().toISOString(), tagIds: ["b"], dataUrl: MARK, kind: "drawn" as const, fileHash: "h", override: true };
  const noticeFile = { filename: "fnb.pdf", ext: "pdf", hash: "h".repeat(64), lines: [] } as never;
  const twoPages = await PDFDocument.create();
  twoPages.addPage([595, 842]);
  twoPages.addPage([595, 842]);
  const out = await PDFDocument.load(await signedNoticePdf(noticeFile, Buffer.from(await twoPages.save()), [stampSig, { ...stampSig, userId: "w", tagIds: [], dataUrl: PNG_MARK }], stampSlots));
  check("stamped on the original, no page added", out.getPageCount(), 2);
  check("the last page grows to hold it", [out.getPage(0).getHeight(), out.getPage(1).getHeight() > 842], [842, true]);
  const turned = await PDFDocument.create();
  turned.addPage([842, 595]).setRotation(degrees(90));
  check("a turned page keeps its shape, stamp on its own page", (await PDFDocument.load(await signedNoticePdf(noticeFile, Buffer.from(await turned.save()), [stampSig], stampSlots))).getPageCount(), 2);
  check("a damaged PDF still gives the stamp", (await PDFDocument.load(await signedNoticePdf(noticeFile, Buffer.from("%PDF-junk"), [stampSig], stampSlots))).getPageCount(), 1);
  const picture = Buffer.from(MARK.split(",")[1], "base64");
  check("a screenshot becomes one stamped page", (await PDFDocument.load(await signedNoticePdf({ ...(noticeFile as object), ext: "png" } as never, picture, [stampSig], stampSlots))).getPageCount(), 1);

  // --- The signed invoice, from when each invoice was signed: still opens
  const signed = await import("../app/api/payments/invoices/[id]/signed/route");
  const { signedInvoicePdf } = await import("../lib/paymentSignedPdf");
  const { writeJson, updateInList } = await import("../lib/controlData");
  aiAnswer = { supplierName: "Older Supplier", invoiceNumber: "OLD-1", invoiceDate: "2026-11-01", amountDue: 7, accountNumber: "", branchCode: "" };
  const old = (await (await load(clerk, pdf("old"))).json()).id;
  check("not yet signed: nothing to show", (await signed.GET(req(clerk, "/x"), ctx(old))).status, 409);
  await writeJson(`payments/invoices/${old}/signatures.json`, [{ userId: "pat", name: "pat T", at: new Date().toISOString(), tagIds: ["principal"], dataUrl: MARK, kind: "drawn", fileHash: "h", bank: "match", amount: "match", override: false }]);
  await updateInList<{ id: string; signedBy: unknown[] }>("payments/invoices.json", old, (i) => ({ ...i, signedBy: [{ userId: "pat", name: "pat T", at: new Date().toISOString(), tagIds: ["principal"] }] }));
  check("an old signature still counts on its row", (await statusOf(old)).progress.signed, 1);
  check("and its row cannot be deleted", (await invoice.DELETE(req(clerk, "/x", "DELETE"), ctx(old))).status, 409);
  check("closed to a stranger", (await signed.GET(req(stranger, "/x"), ctx(old))).status, 403);
  const signedRes = await signed.GET(req(principal, "/x?download=1"), ctx(old));
  check("a signer can open it", [signedRes.status, signedRes.headers.get("content-type")], [200, "application/pdf"]);
  check("named as signed", signedRes.headers.get("content-disposition")?.includes("Signed - "), true);

  const three = await PDFDocument.create();
  [0, 1, 2].forEach(() => three.addPage());
  const sigBase = { userId: "u", name: "Sipho Ndlovu š", at: new Date().toISOString(), tagIds: [], dataUrl: MARK, kind: "drawn" as const, fileHash: "h", bank: "match", amount: "mismatch", override: true };
  const fake = { filename: "café € invoice.pdf", ext: "pdf", hash: "h", supplierName: "Ačme", invoiceNumber: "1", invoiceDate: "2026-11-01", amountDue: 10 } as never;
  const built = await signedInvoicePdf(fake, Buffer.from(await three.save()), [sigBase, { ...sigBase, userId: "v", dataUrl: PNG_MARK }]);
  check("original pages kept, one signature page added", (await PDFDocument.load(built)).getPageCount(), 4);
  const many = await signedInvoicePdf(fake, Buffer.from(await three.save()), Array.from({ length: 12 }, (_, i) => ({ ...sigBase, userId: String(i) })));
  check("many signatures run onto another page", (await PDFDocument.load(many)).getPageCount() > 4, true);

  // --- Approved at the bank, then Paid
  await release.POST(json(principal, "/x", "POST", { released: true }), ctx(notice));
  n = await noticeRow();
  check("1 of 2 have approved", [n.status, n.progress.approved, n.progress.slots[0].approved, n.progress.slots[1].approved], ["approving", 1, true, false]);
  await release.POST(json(sgb, "/x", "POST", { released: true }), ctx(notice));
  check("2 of 2 have approved", (await noticeRow()).progress.approved, 2);
  await release.POST(json(sgb, "/x", "POST", { released: false }), ctx(notice));
  check("a tick can be taken back", (await noticeRow()).progress.approved, 1);
  check("the invoice row shows the same", (await statusOf(inv)).status, "approving");
  aiAnswer = { payments: [{ date: "2026-11-04", payee: "FNB APP PAYMENT ACME SUPP", amount: 1000, reference: "" }, { date: "2026-11-04", payee: "SALARIES", amount: 90000, reference: "" }] };
  const statementRes = await screens.POST(req(clerk, "/api/payments/screens?kind=statement", "POST", form({ file: pdf("statement") })));
  check("statement loaded", statementRes.status, 201);
  const statementId = (await statementRes.json()).id;
  row = await statusOf(inv);
  check("Paid, with the date", [row.status, row.paidOn], ["paid", "2026-11-04"]);
  check("a statement line never shows as a bank payment with no invoice", (await inbox(clerk)).unmatched.length, 1);
  check("a statement is no notice to sign", (await inbox(clerk)).notices.length, 1);
  check("nor can it get a code", (await codeRoute.POST(req(deputy, "/x", "POST"), ctx(statementId))).status, 404);
  check("the statement is closed to a signer", (await files.GET(req(principal, "/x"), { params: Promise.resolve({ kind: "screen", id: statementId }) })).status, 403);
  check("nor can a stamped copy open it", (await noticePdf.GET(req(principal, "/x"), ctx(statementId))).status, 404);
  check("and open to the clerk", (await files.GET(req(clerk, "/x"), { params: Promise.resolve({ kind: "screen", id: statementId }) })).status, 200);

  // --- Red and grey still show on the invoice
  aiAnswer = { supplierName: "Acme Supplies", invoiceNumber: "INV-2", invoiceDate: "2026-11-02", amountDue: 200, accountNumber: "11111111111", branchCode: "" };
  const redId = (await (await load(clerk, pdf("inv2"))).json()).id;
  check("changed bank details: red", (await statusOf(redId)).bank.detail, "...1111 / ...5678");

  // --- A deleted signing tag
  const { deleteTag } = await import("../lib/tagData");
  await deleteTag("sgb");
  check("a deleted tag stops counting", (await (await settings.GET(req(admin, "/x"))).json()).signerTagIds, ["principal"]);

  // --- No proof
  aiAnswer = { supplierName: "Bare Supplier", invoiceNumber: "INV-5", invoiceDate: "2026-11-02", amountDue: 40, accountNumber: "33333333333", branchCode: "250655" };
  const bareRow = await statusOf((await (await load(clerk, pdf("inv5"))).json()).id);
  check("no proof: still green, with the orange alert", [bareRow.bank.status, bareRow.noProof], ["match", true]);

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
