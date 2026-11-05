import { NextResponse } from "next/server";
import { NO_CHANGE, addToList, readJson, removeFromList, updateInList, updateJson } from "./controlData";
import { getTagMembers } from "./tagData";
import { getUsers } from "./userData";
import { getPeople } from "./peopleData";
import { isAiOutOfCredit } from "./aiErrors";
import { ReadError } from "./paymentAi";
import { fileKind, type BankScreen, type Contact, type ContactInput, type Invoice, type SignedBy, type StoredFile } from "./payments";

// Storage for payment approvals. Lists are guarded (lib/controlData.ts), files
// are keyed by id so nothing a person named a file can reach a blob path.

const CONTACTS = "payments/contacts.json";
const INVOICES = "payments/invoices.json";
const SCREENS = "payments/screens.json";
const SETTINGS = "payments/settings.json";

const MAX_FILE_BYTES = 4 * 1024 * 1024;

export const FILE_PATHS = {
  invoice: (id: string, f: StoredFile) => `payments/invoices/${id}/file.${f.ext}`,
  screen: (id: string, f: StoredFile) => `payments/screens/${id}/file.${f.ext}`,
  proof: (id: string, f: StoredFile) => `payments/contacts/${id}/proof.${f.ext}`,
};

export const getContacts = () => readJson<Contact[]>(CONTACTS, []);
export const getInvoices = () => readJson<Invoice[]>(INVOICES, []);
export const getScreens = () => readJson<BankScreen[]>(SCREENS, []);
export const addInvoice = (inv: Invoice) => addToList(INVOICES, inv);
export const addScreen = (s: BankScreen) => addToList(SCREENS, s);
export const addContact = (c: Contact) => addToList(CONTACTS, c);
export const removeContact = (id: string) => removeFromList<Contact>(CONTACTS, id);
export const removeScreen = (id: string) => removeFromList<BankScreen>(SCREENS, id);

export function saveContact(id: string, input: ContactInput, proof: StoredFile | null) {
  return updateInList<Contact>(CONTACTS, id, (c) => ({ ...c, ...input, proof: proof ?? c.proof, updatedAt: new Date().toISOString() }));
}

/** Signed invoices stay: they are the record of who authorised what. */
export async function removeInvoice(id: string): Promise<Invoice | "signed" | null> {
  let out: Invoice | "signed" | null = null;
  await updateJson<Invoice[]>(INVOICES, [], (list) => {
    const inv = list.find((x) => x.id === id) ?? null;
    out = inv && inv.signedBy.length ? "signed" : inv;
    return out && out !== "signed" ? list.filter((x) => x.id !== id) : NO_CHANGE;
  });
  return out;
}

// --- Who may sign -------------------------------------------------------------
// A signature is a named person's authority, so it sits on a tag, never a role.
// Ships with no tags on purpose: nobody signs until an admin says who. No
// Super Admin bypass either: platform staff never authorise a school's payments.

export interface PaymentSettings {
  signerTagIds: string[];
}

export const getPaymentSettings = () => readJson<PaymentSettings>(SETTINGS, { signerTagIds: [] });

export async function savePaymentSettings(signerTagIds: string[]) {
  await updateJson<PaymentSettings>(SETTINGS, { signerTagIds: [] }, () => ({ signerTagIds }));
}

/** The signing tags this user carries. Empty means they may not sign. */
export async function signingTags(userId: string): Promise<string[]> {
  const { signerTagIds } = await getPaymentSettings();
  if (!signerTagIds.length) return [];
  const preloaded = { users: await getUsers(), people: await getPeople() };
  const held = await Promise.all(signerTagIds.map(async (t) => ((await getTagMembers(t, preloaded)).some((m) => m.userId === userId) ? t : "")));
  return held.filter(Boolean);
}

// --- Signatures ---------------------------------------------------------------

export interface InvoiceSignature extends SignedBy {
  /** Transparent PNG from components/SignaturePad. */
  dataUrl: string;
  kind: "drawn" | "typed";
  /** The exact file signed for. */
  fileHash: string;
  /** What the checks said at that moment; they can change later. */
  bank: string;
  amount: string;
  override: boolean;
}

const signaturesPath = (id: string) => `payments/invoices/${id}/signatures.json`;
export const getSignatures = (id: string) => readJson<InvoiceSignature[]>(signaturesPath(id), []);

/** False when this person has already signed. Safe to retry: the row is set
 *  from the signature, so a failure between the two writes heals on the next try. */
export async function addSignature(id: string, sig: InvoiceSignature): Promise<boolean> {
  let added = false;
  const all = await updateJson<InvoiceSignature[]>(signaturesPath(id), [], (list) => {
    added = !list.some((s) => s.userId === sig.userId);
    return added ? [...list, sig] : NO_CHANGE;
  });
  await updateInList<Invoice>(INVOICES, id, (inv) => ({
    ...inv,
    signedBy: all.map(({ userId, name, at, tagIds }) => ({
      userId,
      name,
      at,
      tagIds,
      releasedAt: inv.signedBy.find((s) => s.userId === userId)?.releasedAt,
    })),
  }));
  return added;
}

/** A signer's own "I released this at the bank". False when they have not signed. */
export async function setReleased(id: string, userId: string, released: boolean): Promise<boolean> {
  let signed = false;
  await updateInList<Invoice>(INVOICES, id, (inv) => {
    signed = inv.signedBy.some((s) => s.userId === userId);
    return {
      ...inv,
      signedBy: inv.signedBy.map((s) => (s.userId === userId ? { ...s, releasedAt: released ? new Date().toISOString() : undefined } : s)),
    };
  });
  return signed;
}

// --- Shared by the routes that take a file --------------------------------------

/** The uploaded file, checked, or the answer to send back. */
export async function uploadedFile(
  req: Request,
  allowed: string[]
): Promise<{ bytes: Buffer; name: string; ext: string; form: FormData } | NextResponse> {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "Files must be under 4 MB." }, { status: 413 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = fileKind(bytes);
  if (!ext || !allowed.includes(ext)) return NextResponse.json({ error: `Only ${allowed.join(", ").toUpperCase()} files can be read.` }, { status: 415 });
  return { bytes, name: file.name, ext, form };
}

export function readFailed(err: unknown): NextResponse {
  if (isAiOutOfCredit(err)) return NextResponse.json({ error: "The AI service is out of credit. Please contact support." }, { status: 503 });
  if (err instanceof ReadError) return NextResponse.json({ error: err.message }, { status: 422 });
  console.error("[payments] read failed", err);
  return NextResponse.json({ error: "The file could not be read just now. Nothing was charged. Please try again." }, { status: 502 });
}

export const NO_CREDITS = "Your school needs more credits to read this file. An administrator can order them under Admin > Translation Credits.";
