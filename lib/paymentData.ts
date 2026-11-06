import { NextResponse } from "next/server";
import { NO_CHANGE, addToList, readJson, removeFromList, updateInList, updateJson } from "./controlData";
import { getTagMembers, getTags } from "./tagData";
import { getUsers } from "./userData";
import { getPeople } from "./peopleData";
import { isAiOutOfCredit } from "./aiErrors";
import { ReadError } from "./paymentAi";
import { fileKind, fillSlots, type BankScreen, type Contact, type ContactInput, type Invoice, type SignSlot, type SignedBy, type StoredFile } from "./payments";

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

/** proof: undefined keeps what is on file, null removes it. */
export function saveContact(id: string, input: ContactInput, proof: StoredFile | null | undefined) {
  return updateInList<Contact>(CONTACTS, id, (c) => ({ ...c, ...input, proof: proof === undefined ? c.proof : proof, updatedAt: new Date().toISOString() }));
}

/** A signed notice stays: it is the record of who authorised what. */
export async function removeScreen(id: string): Promise<BankScreen | "signed" | null> {
  let out: BankScreen | "signed" | null = null;
  await updateJson<BankScreen[]>(SCREENS, [], (list) => {
    const s = list.find((x) => x.id === id) ?? null;
    out = s?.signedBy?.length ? "signed" : s;
    return out && out !== "signed" ? list.filter((x) => x.id !== id) : NO_CHANGE;
  });
  return out;
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

/** A deleted tag drops out here, or "signed by all" could never be reached. */
export async function getPaymentSettings(): Promise<PaymentSettings> {
  const [saved, tags] = await Promise.all([readJson<PaymentSettings>(SETTINGS, { signerTagIds: [] }), getTags()]);
  return { signerTagIds: saved.signerTagIds.filter((id) => tags.some((t) => t.id === id)) };
}

export async function savePaymentSettings(signerTagIds: string[]) {
  await updateJson<PaymentSettings>(SETTINGS, { signerTagIds: [] }, () => ({ signerTagIds }));
}

/** Each ticked tag is one line on the stamp. Someone with no login cannot sign, so is not listed.
 *  Pass the notices to also get the lines they froze before a tag was unticked. */
export async function getSigningSlots(notices: BankScreen[] = []): Promise<SignSlot[]> {
  const { signerTagIds } = await getPaymentSettings();
  const [tags, users, people] = await Promise.all([getTags(), getUsers(), getPeople()]);
  const live = signerTagIds.map((tagId) => ({ tagId, label: tags.find((t) => t.id === tagId)?.name ?? "" }));
  const frozen = new Map(notices.flatMap((n) => n.frozen?.slots ?? []).filter((f) => !signerTagIds.includes(f.tagId)).map((f) => [f.tagId, f]));
  const slot = async (s: { tagId: string; label: string }, retired: boolean): Promise<SignSlot> => ({
    ...s,
    members: (await getTagMembers(s.tagId, { users, people })).flatMap((m) => (m.userId ? [{ userId: m.userId, name: m.name }] : [])),
    ...(retired ? { retired } : {}),
  });
  return Promise.all([...live.map((s) => slot(s, false)), ...[...frozen.values()].map((s) => slot(s, true))]);
}

/** The signing tags this user carries. Empty means they may not sign. */
export const tagsHeld = (slots: SignSlot[], userId: string) => slots.filter((s) => s.members.some((m) => m.userId === userId)).map((s) => s.tagId);

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

/** Written by the first version, which signed each invoice. Read-only now. */
export const getSignatures = (id: string) => readJson<InvoiceSignature[]>(`payments/invoices/${id}/signatures.json`, []);

/** What each payment's checks said when this person signed; the live ones can change later. */
export interface NoticeSignature extends Omit<InvoiceSignature, "bank" | "amount"> {
  checks: { payee: string; invoiceId: string; bank: string; amount: string }[];
}

const noticeSignaturesPath = (id: string) => `payments/screens/${id}/signatures.json`;
export const getNoticeSignatures = (id: string) => readJson<NoticeSignature[]>(noticeSignaturesPath(id), []);

/** Would this signature put someone on a line nobody holds? */
export function fillsALine(signed: Pick<SignedBy, "userId" | "tagIds">[], me: Pick<SignedBy, "userId" | "tagIds">, tagIds: string[]): boolean {
  return fillSlots([...signed, me], tagIds).size > fillSlots(signed, tagIds).size;
}

/** Safe to retry: the row is set from the signatures, so a failure between the two writes heals on the next try. */
export async function addNoticeSignature(id: string, sig: NoticeSignature, signerTagIds: string[], frozen: NonNullable<BankScreen["frozen"]>): Promise<"signed" | "already" | "line_taken"> {
  let out: "signed" | "already" | "line_taken" = "signed";
  const all = await updateJson<NoticeSignature[]>(noticeSignaturesPath(id), [], (list) => {
    out = list.some((s) => s.userId === sig.userId) ? "already" : fillsALine(list, sig, signerTagIds) ? "signed" : "line_taken";
    return out === "signed" ? [...list, sig] : NO_CHANGE;
  });
  // Added to what is there, never replacing it: two people signing at once each
  // hold a different copy of `all`, and the slower write must not drop the other.
  await updateInList<BankScreen>(SCREENS, id, (s) => {
    const had = s.signedBy ?? [];
    const fresh = all.filter((a) => !had.some((b) => b.userId === a.userId)).map(({ userId, name, at, tagIds }) => ({ userId, name, at, tagIds }));
    return { ...s, signedBy: [...had, ...fresh], frozen: s.frozen ?? frozen };
  });
  return out;
}

/** A signer's own "I approved this at the bank". False when they have not signed. */
export async function setReleased(id: string, userId: string, released: boolean): Promise<boolean> {
  let signed = false;
  await updateInList<BankScreen>(SCREENS, id, (s) => {
    signed = !!s.signedBy?.some((b) => b.userId === userId);
    return {
      ...s,
      signedBy: s.signedBy?.map((b) => (b.userId === userId ? { ...b, releasedAt: released ? new Date().toISOString() : undefined } : b)),
    };
  });
  return signed;
}

// One-time codes, kept apart from the screen list because that list feeds the inbox route.
type NoticeCodes = Record<string, { hash: string; sentAt: string }>;
const codesPath = (id: string) => `payments/screens/${id}/codes.json`;
export const noticeCodeSalt = (id: string, userId: string) => `notice:${id}:${userId}`;
const CODE_LIFE_MS = 60 * 60 * 1000;
export const codeExpired = (sentAt: string) => Date.now() - Date.parse(sentAt) > CODE_LIFE_MS;
export const getNoticeCodes = (id: string) => readJson<NoticeCodes>(codesPath(id), {});
export const saveNoticeCode = (id: string, userId: string, hash: string) =>
  updateJson<NoticeCodes>(codesPath(id), {}, (codes) => ({ ...codes, [userId]: { hash, sentAt: new Date().toISOString() } }));
/** The code is spent once it has signed. */
export const spendNoticeCode = (id: string, userId: string) =>
  updateJson<NoticeCodes>(codesPath(id), {}, ({ [userId]: _spent, ...rest }) => rest);

// --- Shared by the routes that take a file --------------------------------------

/** The uploaded file, checked, or the answer to send back. */
export async function uploadedFile(
  req: Request,
  allowed: string[]
): Promise<{ bytes: Buffer; name: string; ext: string } | NextResponse> {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "Files must be under 4 MB." }, { status: 413 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = fileKind(bytes);
  if (!ext || !allowed.includes(ext)) return NextResponse.json({ error: `Only ${allowed.join(", ").toUpperCase()} files can be read.` }, { status: 415 });
  return { bytes, name: file.name, ext };
}

export function readFailed(err: unknown): NextResponse {
  if (isAiOutOfCredit(err)) return NextResponse.json({ error: "The AI service is out of credit. Please contact support." }, { status: 503 });
  if (err instanceof ReadError) return NextResponse.json({ error: err.message }, { status: 422 });
  console.error("[payments] read failed", err);
  return NextResponse.json({ error: "The file could not be read just now. Nothing was charged. Please try again." }, { status: 502 });
}

export const NO_CREDITS = "Your school needs more credits to read this file. An administrator can order them under Admin > Translation Credits.";
