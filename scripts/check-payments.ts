// Checks the payment approval rules: who a supplier is, when bank details and
// amounts match, how bank payments pair with invoices, what is refused at the
// door, and that a failed AI read gives the credits back.
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-payments.ts
import assert from "node:assert/strict";
import {
  bankChanged,
  buildInbox,
  cleanBankLines,
  cleanFilename,
  cleanInvoiceRead,
  fileKind,
  findContact,
  invoiceStatus,
  namesMatch,
  parseContactInput,
  sameAccount,
  type BankLine,
  type BankScreen,
  type Contact,
  type Invoice,
} from "../lib/payments";

for (const k of ["BLOB_READ_WRITE_TOKEN", "CONTROL_BLOB_READ_WRITE_TOKEN", "MULTI_TENANT"]) delete process.env[k];
process.env.NEXT_PUBLIC_SCHOOL ||= "hvps";

const now = "2026-11-05T08:00:00.000Z";
const contact = (id: string, name: string, accountNumber: string, branchCode = "250655", extra: Partial<Contact> = {}): Contact => ({
  id, type: "creditor", name, regNumber: "", address: "", vatNumber: "", personName: "", personEmail: "", personCell: "", services: "",
  bank: { bankName: "FNB", accountHolder: name, accountNumber, branchCode, accountType: "" },
  proof: { filename: "p.pdf", ext: "pdf" }, createdBy: "u", createdAt: now, updatedAt: now, ...extra,
});
const invoice = (id: string, supplierName: string, amountDue: number | null, accountNumber = "", extra: Partial<Invoice> = {}): Invoice => ({
  id, filename: `${id}.pdf`, ext: "pdf", hash: id, supplierName, supplierVat: "", supplierReg: "", invoiceNumber: "", invoiceDate: "2026-11-01",
  amountDue, accountNumber, branchCode: "", loadedBy: "u", loadedByName: "U", loadedAt: now, signedBy: [], ...extra,
});
const line = (payee: string, amount: number | null, extra: Partial<BankLine> = {}): BankLine => ({ payee, amount, accountNumber: "", branchCode: "", reference: "", ...extra });
const screen = (...lines: BankLine[]): BankScreen => ({ id: "s", filename: "s.png", ext: "png", hash: "s", loadedBy: "u", loadedByName: "U", loadedAt: now, lines });
const row = (invoices: Invoice[], contacts: Contact[], lines: BankLine[] = [], id = invoices[0].id) =>
  buildInbox(invoices, contacts, [screen(...lines)]).rows.find((r) => r.id === id)!;

// Names
assert.ok(namesMatch("ABC Cleaning (Pty) Ltd", "abc cleaning"), "company suffix ignored");
assert.ok(namesMatch("ABC CLEANING SER", "ABC Cleaning Services CC"), "a bank's cut-off name");
assert.ok(!namesMatch("ABC Cleaning", "XYZ Cleaning"), "different business");
assert.ok(!namesMatch("Pty Ltd", "Pty Ltd"), "nothing but suffixes is no name at all");

// Finding the contact
const acme = contact("1", "Acme Supplies (Pty) Ltd", "62012345678", "250655", { vatNumber: "4123456789" });
const garden = contact("2", "Green Garden Services", "1234567890");
assert.equal(findContact([acme, garden], { name: "Totally different", vat: "4123 456 789" })?.id, "1", "VAT number beats the name");
assert.equal(findContact([acme, garden], { name: "ACME SUPPLIES" })?.id, "1");
assert.equal(findContact([acme, garden], { name: "Nobody" }), null);
const twins = [contact("3", "Star Plumbing North", "111111"), contact("4", "Star Plumbing South", "222222")];
assert.equal(findContact(twins, { name: "Star Plumbing" }), null, "two possible contacts is no contact");

// Account numbers
assert.equal(sameAccount("62 0123 45678", "62012345678"), true, "spaces ignored");
assert.equal(sameAccount("062012345678", "62012345678"), true, "leading zero ignored");
assert.equal(sameAccount("62012345679", "62012345678"), false);
assert.equal(sameAccount("****5678", "62012345678"), true, "masked: the digits shown");
assert.equal(sameAccount("****5679", "62012345678"), false);
assert.equal(sameAccount("****78", "62012345678"), null, "too few digits to say anything");
assert.equal(sameAccount("****0123", "99999123"), false, "a zero in the tail is a real digit");
assert.equal(sameAccount("****0123", "99990123"), true);
assert.equal(sameAccount("", "62012345678"), null);

// Bank Details Match: the three icons
assert.equal(row([invoice("i", "Acme Supplies", 100, "62012345678")], [acme]).bank.status, "match", "green");
const red = row([invoice("i", "Acme Supplies", 100, "99999999999")], [acme]).bank;
assert.equal(red.status, "mismatch", "red");
assert.equal(red.detail, "...9999 / ...5678", "last digits only");
assert.equal(row([invoice("i", "Unknown Co", 100, "99999999999")], [acme]).bank.code, "no_contact", "grey: no contact");
assert.equal(row([invoice("i", "Acme Supplies", 100)], [acme]).bank.code, "no_bank_read", "grey: nothing read is never green");
assert.equal(row([invoice("i", "Acme", 100, "62012345678", { branchCode: "632005" })], [acme]).bank.status, "mismatch", "same number at another branch is red");
assert.equal(row([invoice("i", "Bare Co", 100, "62012345678")], [contact("5", "Bare Co", "1", "1", { bank: null })]).bank.code, "contact_no_bank");
assert.equal(row([invoice("i", "Debtor Co", 100, "62012345678")], [contact("6", "Debtor Co", "62012345678", "250655", { type: "debtor" })]).bank.code, "no_contact", "a debtor never vouches for an invoice");
assert.equal(row([invoice("i", "Both Co", 100, "62012345678")], [contact("7", "Both Co", "62012345678"), contact("8", "Both Co", "62012345678", "250655", { type: "debtor" })]).bank.status, "match", "the same business as both is one creditor");
assert.equal(row([invoice("i", "Acme", 100, "62012345678")], [acme], [line("Acme", 100)]).bank.code, "bank_match_invoice_only", "the screen shows no account: says so");
assert.equal(row([invoice("i", "Acme", 100, "62012345678")], [acme], [line("Acme", 100, { accountNumber: "11111111111" })]).bank.code, "bank_payment_differs", "good invoice, redirected bank payment: red");

// Amount Match
const inv = invoice("i", "Acme Supplies", 1250.5);
assert.equal(row([inv], [acme]).amount.code, "no_payment", "no bank screen yet");
assert.equal(row([inv], [acme], [line("ACME SUPPLIES", 1250.5)]).amount.status, "match");
const off = row([inv], [acme], [line("ACME SUPPLIES", 1450.5)]);
assert.equal(off.amount.status, "mismatch");
assert.equal(off.delta, 200, "the Rand delta");
assert.equal(row([invoice("i", "Acme", 0.1 + 0.2)], [acme], [line("Acme", 0.3)]).amount.status, "match", "no floating point cents");
const orphan = buildInbox([inv], [acme], [screen(line("Nobody Known", 50))]);
assert.equal(orphan.unmatched.length, 1, "payment with no invoice is surfaced");
assert.equal(orphan.unmatched[0].check.status, "unknown");

// Pairing several invoices from one supplier
const a = invoice("a", "Acme", 100, "", { invoiceNumber: "INV-001" });
const b = invoice("b", "Acme", 200, "", { invoiceNumber: "INV-002" });
assert.equal(row([a, b], [acme], [line("Acme", 200)], "b").amount.status, "match", "exact amount finds the right one");
assert.equal(row([a, b], [acme], [line("Acme", 150, { reference: "inv 002" })], "b").delta, -50, "reference beats amount");
const vague = buildInbox([a, b], [acme], [screen(line("Acme", 999))]);
assert.equal(vague.unmatched.length, 1, "two possible invoices, none exact: no guess");
assert.ok(vague.rows.every((r) => r.delta === null));
const two = buildInbox([a, b], [acme], [screen(line("Acme", 100), line("Acme", 200))]);
assert.ok(two.rows.every((r) => r.amount.status === "match") && two.unmatched.length === 0, "each payment takes its own invoice");
assert.equal(row([invoice("i", "Green Garden Services", 10)], [garden], [line("MY GARDENER", 10, { accountNumber: "1234567890" })]).amount.status, "match", "nickname, whole account number");

// Statuses
const green = { status: "match", code: "bank_match" } as const;
const grey = { status: "unknown", code: "no_payment" } as const;
const tags = ["principal", "sgb"];
const signer = (userId: string, tagIds: string[], releasedAt?: string) => ({ userId, name: userId, at: now, tagIds, releasedAt });
const status = (signedBy: Invoice["signedBy"], bank: typeof green | typeof grey = green, amount: typeof green | typeof grey = green, paid = false) =>
  invoiceStatus({ signedBy }, bank, amount, paid, tags);
assert.equal(status([], green, grey), "pending_approval", "a check is not green");
assert.equal(status([]), "pending_signatures");
assert.equal(status([signer("a", ["principal"])]), "signed_one");
assert.equal(status([signer("a", ["principal"]), signer("b", ["principal"])]), "signed_one", "two from one tag is not everyone");
assert.equal(status([signer("a", ["principal", "sgb"])]), "signed_one", "one person holding both tags is still one person");
assert.equal(status([signer("a", ["principal"]), signer("b", ["sgb"])]), "signed_all");
assert.equal(status([signer("a", ["principal"], now), signer("b", ["sgb"])]), "released_one");
assert.equal(status([signer("a", ["principal"], now), signer("b", ["sgb"], now)]), "released_all");
assert.equal(status([], green, green, true), "paid", "the statement outranks everything");
const threeTags = ["a", "b", "c"];
const signedAll = (...who: Invoice["signedBy"]) => invoiceStatus({ signedBy: who }, green, green, false, threeTags) === "signed_all";
assert.ok(!signedAll(signer("x", ["a", "b", "c"]), signer("y", ["a"]), signer("z", ["a"])), "two tags cannot rest on one person");
assert.ok(signedAll(signer("x", ["a", "b"]), signer("y", ["b", "c"]), signer("z", ["a"])), "people can be shuffled to fit");

// Paid, from a statement
const statement = (...lines: BankLine[]): BankScreen => ({ ...screen(...lines), id: "st", kind: "statement" });
const paidRow = (i: Invoice, ...lines: BankLine[]) => buildInbox([i], [acme], [statement(...lines)]).rows[0];
const owed = invoice("i", "Acme Supplies", 500, "", { invoiceNumber: "INV-77", invoiceDate: "2026-11-01" });
assert.equal(paidRow(owed, line("FNB OB PMT ACME SUPP", 500, { date: "2026-11-03" })).status, "paid", "supplier word in the description");
assert.equal(paidRow(owed, line("FNB OB PMT 12345", 500, { date: "2026-11-03", reference: "INV77" })).paidOn, "2026-11-03", "invoice number in the reference");
assert.notEqual(paidRow(owed, line("ACME SUPP", 499, { date: "2026-11-03" })).status, "paid", "not the exact amount");
assert.notEqual(paidRow(owed, line("WOOLWORTHS", 500, { date: "2026-11-03" })).status, "paid", "same amount, someone else");
assert.notEqual(paidRow(owed, line("ACME SUPP", 500, { date: "2026-10-03" })).status, "paid", "paid before the invoice existed");
assert.ok(paidRow(owed, line("ACME SUPP", 500, { date: "2026-11-03" })).paidUnsigned, "paid with nobody signed is flagged");
const jan = invoice("jan", "Acme", 1500, "", { invoiceNumber: "INV-0101", invoiceDate: "2026-01-01" });
const feb = invoice("feb", "Acme", 1500, "", { invoiceNumber: "INV-0202", invoiceDate: "2026-02-01" });
const monthly = buildInbox([jan, feb], [acme], [statement(line("ACME", 1500, { date: "2026-02-20", reference: "INV-0202" }))]).rows;
assert.deepEqual(monthly.map((r) => r.status === "paid"), [false, true], "the payment finds its own month");
const nextMonth = buildInbox([jan, feb], [acme], [statement(line("ACME", 1500, { date: "2026-01-20", reference: "INV-0101" })), screen(line("ACME", 1500))]).rows;
assert.deepEqual(nextMonth.map((r) => r.amount.status), ["unknown", "match"], "a new payment goes to the unpaid invoice");
const repeat = buildInbox([invoice("x", "Acme", 500), invoice("y", "Acme", 500, "", { hash: "y" })], [acme], [statement(line("ACME", 500))]);
assert.equal(repeat.rows.filter((r) => r.status === "paid").length, 1, "one statement line pays one invoice");
assert.equal(buildInbox([owed], [acme], [statement(line("Nobody", 5))]).unmatched.length, 0, "statement lines are not 'no invoice' rows");

// The form
const creditor = { type: "creditor", name: "X", bank: { bankName: "FNB", accountHolder: "X", accountNumber: "62 0123 45678", branchCode: "250655" } };
assert.ok(!parseContactInput({ name: "X" }).ok, "type required");
assert.ok(!parseContactInput({ type: "creditor" }).ok, "name required");
assert.ok(!parseContactInput({ type: "creditor", name: "X" }).ok, "bank required for a creditor");
assert.ok(parseContactInput({ type: "debtor", name: "X" }).ok, "not for a debtor");
assert.ok(!parseContactInput({ ...creditor, bank: { ...creditor.bank, branchCode: "123" } }).ok, "branch code is 6 digits");
assert.ok(!parseContactInput({ ...creditor, personEmail: "nope" }).ok);
const parsed = parseContactInput(creditor);
assert.ok(parsed.ok && parsed.value.bank?.accountNumber === "62012345678", "digits only");
assert.ok(bankChanged(acme.bank, { ...acme.bank!, accountNumber: "1" }));
assert.ok(!bankChanged(acme.bank, { ...acme.bank!, bankName: "First National" }), "a tidied bank name needs no new proof");

// What the AI returns is cleaned too
const read = cleanInvoiceRead({ supplierName: "  A ", amountDue: "100", invoiceDate: "1 Nov 2026", accountNumber: 5 });
assert.deepEqual([read.supplierName, read.amountDue, read.invoiceDate, read.accountNumber], ["A", null, "", ""]);
assert.equal(cleanBankLines({ payments: [{ payee: "A", amount: 1.005 }, {}, "x"] }).length, 1);
assert.deepEqual(cleanBankLines(null), []);

// Real type from the bytes; names stay out of paths
assert.equal(fileKind(Buffer.from("%PDF-1.7 ...")), "pdf");
assert.equal(fileKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])), "png");
assert.equal(fileKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "jpg");
assert.equal(fileKind(Buffer.from("<svg onload=alert(1)>")), null, "an SVG named .png is refused");
assert.equal(cleanFilename("../a\\b\n.pdf"), ".. a b .pdf");

// Credits: charged the actual cost, all back on a failure
(async () => {
const { addCredits, getCredits } = await import("../lib/contentTranslation");
const { paidRead, READ_HOLD } = await import("../lib/paymentAi");
await addCredits(2);
const usage = { input_tokens: 3000, output_tokens: 400 };
const fine = await paidRead(async () => ({ data: 1, usage }), () => true);
assert.ok(fine.ok);
assert.equal(await getCredits(), 1.9, "one small invoice: 0.1 credit");
const useless = await paidRead(async () => ({ data: 0, usage }), () => false);
assert.ok(!useless.ok && useless.reason === "unreadable");
assert.equal(await getCredits(), 1.9, "unreadable: refunded");
await assert.rejects(paidRead(async () => { throw new Error("AI down"); }, () => true));
assert.equal(await getCredits(), 1.9, "AI failure: refunded");
const huge = await paidRead(async () => ({ data: 1, usage: { input_tokens: 9e6, output_tokens: 0 } }), () => true);
assert.ok(huge.ok);
assert.equal(await getCredits(), 1.9 - READ_HOLD, "never more than the hold");
await addCredits(-(await getCredits()));
const broke = await paidRead(async () => ({ data: 1, usage }), () => true);
assert.ok(!broke.ok && broke.reason === "no_credits", "no credits, no AI call");

console.log("check-payments: all passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
