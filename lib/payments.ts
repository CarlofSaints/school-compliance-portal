import { tk } from "./i18n/translate";

// ---------------------------------------------------------------------------
// Payment approvals: contacts, the invoice inbox and the bank-screen checks.
// PURE and client-safe.
//
// The AI only READS (lib/paymentAi.ts). Every tick and cross is decided here,
// by code, at read time, from what was read and the contact list, so adding or
// correcting a contact updates the inbox with nothing stored to go stale. An
// invoice that tells the AI to say the details match changes nothing.
// A wrong green can lose the school money and a wrong red costs a human check,
// so anything unclear is grey or red, never green.
// ---------------------------------------------------------------------------

export const CONTACT_TYPES = ["creditor", "debtor"] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export interface BankDetails {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  branchCode: string;
  accountType: string;
}

export interface StoredFile {
  filename: string;
  ext: string;
}

export interface Contact {
  id: string;
  type: ContactType;
  name: string;
  regNumber: string;
  bank: BankDetails | null;
  proof: StoredFile | null;
  address: string;
  vatNumber: string;
  personName: string;
  personEmail: string;
  personCell: string;
  services: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type ContactInput = Omit<Contact, "id" | "proof" | "createdBy" | "createdAt" | "updatedAt">;

/** What the AI read off an invoice. Blank or null where it could not. */
export interface InvoiceRead {
  supplierName: string;
  supplierVat: string;
  supplierReg: string;
  invoiceNumber: string;
  /** YYYY-MM-DD */
  invoiceDate: string;
  amountDue: number | null;
  accountNumber: string;
  branchCode: string;
}

export interface SignedBy {
  userId: string;
  name: string;
  at: string;
  /** Which signing tags this person held when they signed. Frozen, like approvers on a spend application. */
  tagIds: string[];
  /** They ticked that they released it at the bank. Their word, not proof: only a statement makes it Paid. */
  releasedAt?: string;
}

export interface Invoice extends InvoiceRead, StoredFile {
  id: string;
  hash: string;
  loadedBy: string;
  loadedByName: string;
  loadedAt: string;
  signedBy: SignedBy[];
}

/** One payment on a bank authorisation screen, or one payment out on a statement
 *  (where payee is the whole transaction description). */
export interface BankLine {
  payee: string;
  amount: number | null;
  accountNumber: string;
  branchCode: string;
  reference: string;
  /** YYYY-MM-DD. Statements only. */
  date?: string;
}

export interface BankScreen extends StoredFile {
  id: string;
  /** Absent on an authorisation screen. A statement shows the school's whole month: see the files route. */
  kind?: "statement";
  hash: string;
  loadedBy: string;
  loadedByName: string;
  loadedAt: string;
  lines: BankLine[];
}

export type CheckStatus = "match" | "mismatch" | "unknown";

/** The hover text for every state. Each cell shows exactly one of these. */
export const CHECK_HOVER = {
  bank_match: tk("Match: the bank details agree with the saved contact."),
  bank_invoice_differs: tk("No match: the bank details on the invoice are different from the saved contact. Do not pay until this is explained."),
  bank_payment_differs: tk("No match: the bank details on the bank payment are different from the saved contact. Do not authorise until this is explained."),
  no_contact: tk("No contact found for this supplier. Add them under Contacts."),
  contact_no_bank: tk("This contact has no bank details saved."),
  no_bank_read: tk("The contact was found, but no bank details could be read from the invoice."),
  amount_match: tk("Match: the bank payment is the same amount as the invoice."),
  amount_differs: tk("No match: the bank payment is a different amount from the invoice."),
  no_payment: tk("No bank payment has been matched to this invoice yet."),
  no_amount: tk("A bank payment was found, but an amount could not be read from it or from the invoice."),
  no_invoice: tk("No invoice found for this bank payment."),
} as const;

export interface Check {
  status: CheckStatus;
  code: keyof typeof CHECK_HOVER;
  /** Last digits only, never the whole account: shown in the hover. */
  detail?: string;
}

export const STATUS_LABELS = {
  pending_approval: tk("Pending approval"),
  pending_signatures: tk("Pending signatures"),
  signed_one: tk("Signed by one"),
  signed_all: tk("Signed by all"),
  released_one: tk("Released by one"),
  released_all: tk("Released by all"),
  paid: tk("Paid"),
} as const;

export type InvoiceStatus = keyof typeof STATUS_LABELS;

export const STATUS_HOVER: Record<InvoiceStatus, string> = {
  pending_approval: tk("The bank details and amount checks are not both green yet."),
  pending_signatures: tk("Both checks are green. Waiting for the first signature."),
  signed_one: tk("Signed, but not yet by everyone who must sign."),
  signed_all: tk("Everyone who must sign has signed."),
  released_one: tk("A signer has ticked that they released this at the bank."),
  released_all: tk("Everyone who must sign has ticked that they released this at the bank. Only the bank statement proves it was paid."),
  paid: tk("A payment for this exact amount is on a bank statement."),
};

export const PAID_UNSIGNED = tk("This was paid before everyone signed it.");

export interface InboxRow {
  id: string;
  status: InvoiceStatus;
  /** The statement date it went out. */
  paidOn: string;
  paidUnsigned: boolean;
  filename: string;
  supplierName: string;
  contactName: string;
  invoiceNumber: string;
  invoiceDate: string;
  amountDue: number | null;
  bank: Check;
  amount: Check;
  /** Paid minus invoiced, in rand. Only on a mismatch. */
  delta: number | null;
  signedBy: SignedBy[];
  loadedAt: string;
}

export interface UnmatchedLine {
  screenId: string;
  screenName: string;
  payee: string;
  amount: number | null;
  reference: string;
  check: Check;
}

// --- Comparing ---------------------------------------------------------------

const onlyDigits = (s: string) => s.replace(/\D/g, "");
const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const cents = (n: number) => Math.round(n * 100);
const last4 = (s: string) => `...${onlyDigits(s).slice(-4)}`;
const isMasked = (s: string) => /[*xX•]/.test(s);

const NAME_NOISE = new Set(["pty", "ltd", "limited", "proprietary", "cc", "inc", "npc", "the", "ta", "trading", "as"]);

function nameWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w && !NAME_NOISE.has(w));
}

/** Same business, allowing for "(Pty) Ltd" and for the cut-off names banks show. */
export function namesMatch(a: string, b: string): boolean {
  const [x, y] = [nameWords(a), nameWords(b)];
  if (!x.length || !y.length) return false;
  const [xs, ys] = [x.join(" "), y.join(" ")];
  if (xs === ys) return true;
  const [short, long] = xs.length <= ys.length ? [x, y] : [y, x];
  const [shortStr, longStr] = [short.join(" "), long.join(" ")];
  return (
    (shortStr.length >= 6 && longStr.startsWith(shortStr)) ||
    (shortStr.length >= 4 && short.every((w, i) => long[i] === w)) ||
    (short.length >= 2 && short.every((w) => long.includes(w)))
  );
}

/** True/false, or null when there is nothing to compare. A bank screen may mask
 *  the number ("****1234"): then only the digits it shows can be compared. */
export function sameAccount(seen: string, saved: string): boolean | null {
  const full = onlyDigits(saved).replace(/^0+/, "");
  if (!seen.trim() || !full) return null;
  const shown = onlyDigits(seen).replace(/^0+/, "");
  if (isMasked(seen)) return shown.length >= 3 ? full.endsWith(shown) : null;
  return shown === full;
}

function sameBank(seen: { accountNumber: string; branchCode: string }, saved: BankDetails): boolean | null {
  const account = sameAccount(seen.accountNumber, saved.accountNumber);
  if (account !== true) return account;
  // A branch only counts when both sides show one, and strictly: a false red
  // on a universal branch code is a human look, a false green is lost money.
  const [a, b] = [onlyDigits(seen.branchCode), onlyDigits(saved.branchCode)];
  return !a || !b || a === b;
}

/** The one contact this could be, or null when none or several fit. Tax and
 *  company numbers are surest; then the name, or the name on the bank account. */
export function findContact(contacts: Contact[], who: { name: string; vat?: string; reg?: string }): Contact | null {
  const [vat, reg] = [onlyDigits(who.vat ?? ""), alnum(who.reg ?? "")];
  const byNumber = contacts.filter((c) => (vat && onlyDigits(c.vatNumber) === vat) || (reg && alnum(c.regNumber) === reg));
  if (byNumber.length === 1) return byNumber[0];
  const wanted = nameWords(who.name).join(" ");
  if (!wanted) return null;
  const names = (c: Contact) => [c.name, c.bank?.accountHolder ?? ""];
  const exact = contacts.filter((c) => names(c).some((n) => nameWords(n).join(" ") === wanted));
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  const close = contacts.filter((c) => names(c).some((n) => namesMatch(n, who.name)));
  return close.length === 1 ? close[0] : null;
}

function contactOf(contacts: Contact[], inv: Invoice): Contact | null {
  return findContact(contacts, { name: inv.supplierName, vat: inv.supplierVat, reg: inv.supplierReg });
}

// A bank nickname may share no word with the supplier: a whole account number
// on one contact identifies them just as well.
function contactOfLine(contacts: Contact[], line: BankLine): Contact | null {
  const byName = findContact(contacts, { name: line.payee });
  if (byName || isMasked(line.accountNumber)) return byName;
  const byAccount = contacts.filter((c) => c.bank && sameAccount(line.accountNumber, c.bank.accountNumber) === true);
  return byAccount.length === 1 ? byAccount[0] : null;
}

/**
 * Pairs each bank payment with one invoice. First the sure ones (the reference
 * carries the invoice number, or the amount is exact), then a payment with only
 * one possible invoice left. Several possible and none exact stays unmatched:
 * guessing would show a delta against the wrong invoice.
 * shortcut: one payment settles one invoice. A payment covering two invoices shows red on one and grey on the other; add a sum match if schools pay like that.
 */
export function pairPayments(invoices: Invoice[], contacts: Contact[], lines: BankLine[]): Map<BankLine, Invoice> {
  const paired = new Map<BankLine, Invoice>();
  const taken = new Set<string>();
  const owners = new Map(invoices.map((inv) => [inv.id, contactOf(contacts, inv)]));
  const open = (line: BankLine) => {
    const contact = contactOfLine(contacts, line);
    return invoices.filter(
      (inv) => !taken.has(inv.id) && ((contact && owners.get(inv.id)?.id === contact.id) || namesMatch(inv.supplierName, line.payee))
    );
  };
  const take = (line: BankLine, inv?: Invoice) => {
    if (!inv) return;
    paired.set(line, inv);
    taken.add(inv.id);
  };
  const byReference = (line: BankLine, inv: Invoice) =>
    alnum(inv.invoiceNumber).length >= 3 && alnum(line.reference).includes(alnum(inv.invoiceNumber));
  const byAmount = (line: BankLine, inv: Invoice) =>
    line.amount !== null && inv.amountDue !== null && cents(line.amount) === cents(inv.amountDue);

  for (const line of lines) take(line, open(line).find((inv) => byReference(line, inv)));
  for (const line of lines) if (!paired.has(line)) take(line, open(line).find((inv) => byAmount(line, inv)));
  for (const line of lines) {
    if (paired.has(line)) continue;
    const left = open(line);
    if (left.length === 1) take(line, left[0]);
  }
  return paired;
}

export function bankCheck(inv: Invoice, contact: Contact | null, line: BankLine | undefined): Check {
  if (!contact) return { status: "unknown", code: "no_contact" };
  if (!contact.bank) return { status: "unknown", code: "contact_no_bank" };
  const onInvoice = sameBank(inv, contact.bank);
  if (onInvoice === false) {
    return { status: "mismatch", code: "bank_invoice_differs", detail: `${last4(inv.accountNumber)} / ${last4(contact.bank.accountNumber)}` };
  }
  const onPayment = line ? sameBank(line, contact.bank) : null;
  if (onPayment === false) {
    return { status: "mismatch", code: "bank_payment_differs", detail: `${last4(line!.accountNumber)} / ${last4(contact.bank.accountNumber)}` };
  }
  if (onInvoice === null && onPayment === null) return { status: "unknown", code: "no_bank_read" };
  return { status: "match", code: "bank_match" };
}

export function amountCheck(inv: Invoice, line: BankLine | undefined): { check: Check; delta: number | null } {
  if (!line) return { check: { status: "unknown", code: "no_payment" }, delta: null };
  if (line.amount === null || inv.amountDue === null) return { check: { status: "unknown", code: "no_amount" }, delta: null };
  const delta = cents(line.amount) - cents(inv.amountDue);
  return delta === 0
    ? { check: { status: "match", code: "amount_match" }, delta: null }
    : { check: { status: "mismatch", code: "amount_differs" }, delta: delta / 100 };
}

/** Every signing tag carried by someone different. A person holding both tags
 *  still counts as one, so "the principal and an SGB member" stays two people. */
function everyTag(who: SignedBy[], tagIds: string[]): boolean {
  return tagIds.length > 0 && who.length >= tagIds.length && tagIds.every((t) => who.some((s) => s.tagIds.includes(t)));
}

export function invoiceStatus(inv: Pick<Invoice, "signedBy">, bank: Check, amount: Check, paid: boolean, signerTagIds: string[]): InvoiceStatus {
  if (paid) return "paid";
  const released = inv.signedBy.filter((s) => s.releasedAt);
  if (released.length) return everyTag(released, signerTagIds) ? "released_all" : "released_one";
  if (inv.signedBy.length) return everyTag(inv.signedBy, signerTagIds) ? "signed_all" : "signed_one";
  return bank.status === "match" && amount.status === "match" ? "pending_signatures" : "pending_approval";
}

/**
 * Finds each invoice's payment on the statements. "Paid" needs more than a
 * screen match because descriptions are full of bank noise: the exact amount,
 * on or after the invoice date, and the invoice number or the supplier's first
 * word in the description. No near misses: unproven stays unpaid.
 */
export function findPaid(invoices: Invoice[], contacts: Contact[], lines: BankLine[]): Map<string, BankLine> {
  const paid = new Map<string, BankLine>();
  const used = new Set<BankLine>();
  for (const inv of invoices) {
    if (inv.amountDue === null) continue;
    const owner = contactOf(contacts, inv);
    const firsts = [inv.supplierName, owner?.name ?? "", owner?.bank?.accountHolder ?? ""].map((n) => nameWords(n)[0] ?? "").filter((w) => w.length >= 4);
    const number = alnum(inv.invoiceNumber);
    const hit = lines.find((l) => {
      if (used.has(l) || l.amount === null || cents(l.amount) !== cents(inv.amountDue!)) return false;
      if (l.date && inv.invoiceDate && l.date < inv.invoiceDate) return false;
      const text = `${l.payee} ${l.reference}`;
      return (number.length >= 3 && alnum(text).includes(number)) || firsts.some((w) => nameWords(text).includes(w));
    });
    if (hit) {
      used.add(hit);
      paid.set(inv.id, hit);
    }
  }
  return paid;
}

export function buildInbox(
  invoices: Invoice[],
  contacts: Contact[],
  allScreens: BankScreen[],
  signerTagIds: string[] = []
): { rows: InboxRow[]; unmatched: UnmatchedLine[] } {
  const screens = allScreens.filter((s) => s.kind !== "statement");
  const paidLines = findPaid(invoices, contacts, allScreens.filter((s) => s.kind === "statement").flatMap((s) => s.lines));
  const lines = screens.flatMap((s) => s.lines);
  const paired = pairPayments(invoices, contacts, lines);
  const lineOf = new Map([...paired].map(([line, inv]) => [inv.id, line]));
  const rows = invoices.map((inv): InboxRow => {
    const contact = contactOf(contacts, inv);
    const line = lineOf.get(inv.id);
    const { check, delta } = amountCheck(inv, line);
    const bank = bankCheck(inv, contact, line);
    const paid = paidLines.get(inv.id);
    return {
      id: inv.id,
      status: invoiceStatus(inv, bank, check, !!paid, signerTagIds),
      paidOn: paid?.date ?? "",
      paidUnsigned: !!paid && !everyTag(inv.signedBy, signerTagIds),
      filename: inv.filename,
      supplierName: inv.supplierName,
      contactName: contact?.name ?? "",
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      amountDue: inv.amountDue,
      bank,
      amount: check,
      delta,
      signedBy: inv.signedBy,
      loadedAt: inv.loadedAt,
    };
  });
  const unmatched = screens.flatMap((s) =>
    s.lines
      .filter((l) => !paired.has(l))
      .map((l): UnmatchedLine => ({
        screenId: s.id,
        screenName: s.filename,
        payee: l.payee,
        amount: l.amount,
        reference: l.reference,
        check: { status: "unknown", code: "no_invoice" },
      }))
  );
  return { rows, unmatched };
}

// --- Cleaning what comes in ---------------------------------------------------

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The JSON field of the contact form, which may hold anything. */
export function contactFromForm(value: unknown): unknown {
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

/** A contact from the form. Bank details are required for a creditor; for a debtor, all or nothing. */
export function parseContactInput(body: unknown): { ok: true; value: ContactInput } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const type = b.type;
  if (!CONTACT_TYPES.includes(type as ContactType)) return { ok: false, error: "Choose creditor or debtor." };
  const name = str(b.name, 200);
  if (!name) return { ok: false, error: "Enter the name of the contact." };
  const rawBank = (b.bank && typeof b.bank === "object" ? b.bank : {}) as Record<string, unknown>;
  const bank: BankDetails = {
    bankName: str(rawBank.bankName, 100),
    accountHolder: str(rawBank.accountHolder, 200),
    accountNumber: onlyDigits(str(rawBank.accountNumber, 40)),
    branchCode: onlyDigits(str(rawBank.branchCode, 20)),
    accountType: str(rawBank.accountType, 50),
  };
  const anyBank = bank.bankName || bank.accountHolder || bank.accountNumber || bank.branchCode;
  if (type === "creditor" || anyBank) {
    if (!bank.bankName || !bank.accountHolder) return { ok: false, error: "Enter the bank and the account holder." };
    if (bank.accountNumber.length < 6 || bank.accountNumber.length > 16) return { ok: false, error: "Enter a valid bank account number." };
    if (bank.branchCode.length !== 6) return { ok: false, error: "A branch code has 6 digits." };
  }
  const personEmail = str(b.personEmail, 200);
  if (personEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personEmail)) return { ok: false, error: "That email address does not look right." };
  return {
    ok: true,
    value: {
      type: type as ContactType,
      name,
      regNumber: str(b.regNumber, 50),
      bank: anyBank ? bank : null,
      address: str(b.address, 500),
      vatNumber: str(b.vatNumber, 30),
      personName: str(b.personName, 200),
      personEmail,
      personCell: str(b.personCell, 30),
      services: str(b.services, 500),
    },
  };
}

/** Did the account actually change? A renamed bank or a re-typed space is not a change. */
export function bankChanged(a: BankDetails | null, b: BankDetails | null): boolean {
  return (a?.accountNumber ?? "") !== (b?.accountNumber ?? "") || (a?.branchCode ?? "") !== (b?.branchCode ?? "");
}

const money = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e10 ? Math.round(v * 100) / 100 : null;

/** The AI's answer is untrusted input too: shape, length and dates are forced here. */
export function cleanInvoiceRead(raw: unknown): InvoiceRead {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const date = str(r.invoiceDate, 10);
  return {
    supplierName: str(r.supplierName, 200),
    supplierVat: str(r.supplierVat, 30),
    supplierReg: str(r.supplierReg, 50),
    invoiceNumber: str(r.invoiceNumber, 60),
    invoiceDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
    amountDue: money(r.amountDue),
    accountNumber: str(r.accountNumber, 40),
    branchCode: str(r.branchCode, 20),
  };
}

export function cleanBankLines(raw: unknown): BankLine[] {
  const list = raw && typeof raw === "object" ? (raw as { payments?: unknown }).payments : null;
  return (Array.isArray(list) ? list : [])
    .slice(0, 200)
    .map((p): BankLine => {
      const r = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
      return {
        payee: str(r.payee, 200),
        amount: money(r.amount),
        accountNumber: str(r.accountNumber, 40),
        branchCode: str(r.branchCode, 20),
        reference: str(r.reference, 100),
        ...(/^\d{4}-\d{2}-\d{2}$/.test(str(r.date, 10)) ? { date: str(r.date, 10) } : {}),
      };
    })
    .filter((l) => l.payee || l.amount !== null);
}

const SIGNATURES: [string, (b: Uint8Array) => boolean][] = [
  ["pdf", (b) => String.fromCharCode(...b.subarray(0, 5)) === "%PDF-"],
  ["png", (b) => b[0] === 0x89 && String.fromCharCode(...b.subarray(1, 4)) === "PNG"],
  ["jpg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["webp", (b) => String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP"],
];

/** The real file type from its first bytes, never from its name. Null when it is not one we take. */
export function fileKind(bytes: Uint8Array): string | null {
  return SIGNATURES.find(([, is]) => is(bytes))?.[0] ?? null;
}

export function cleanFilename(name: string): string {
  return name.replace(/[\x00-\x1f\\/]/g, " ").trim().slice(0, 150) || "file";
}
