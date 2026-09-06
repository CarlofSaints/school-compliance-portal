import crypto from "crypto";
import { readJson, writeJson, readFile, writeFile, deleteFile, listFiles } from "./controlData";
import type {
  MeetingBody,
  MeetingPeriod,
  MinutesReview,
  MinutesReviewer,
  MinutesSection,
  MinutesStatus,
  Signatory,
} from "./minutes";
import { isLocked } from "./minutes";

// ---------------------------------------------------------------------------
// Storage for meeting minutes.
//
// 🔴 ONE BLOB PER RECORD, like the audit trail and unlike everything older
// here. A shared index that every save reads, appends to and writes back has
// lost real data in this project more than once, and minutes are a legal
// record a school is required to keep. Losing one is not an inconvenience.
//
//   minutes/<id>/record.json    the minutes themselves
//   minutes/<id>/original.<ext> an uploaded Word or Excel file, if any
//   minutes/<id>/signed.pdf     the signed copy, once closed
//
// The listing comes from enumerating the folder, not from an index, so nothing
// can be present in storage and missing from the list.
// ---------------------------------------------------------------------------

export * from "./minutes";

export interface MinutesRecord {
  id: string;
  title: string;
  body: MeetingBody;
  period: MeetingPeriod;
  status: MinutesStatus;

  /** Written in the app. Empty for a set of minutes that was only uploaded. */
  sections: MinutesSection[];

  /** Set when a Word or Excel file was uploaded rather than typed. */
  original?: {
    filename: string;
    contentType: string;
    size: number;
    uploadedAt: string;
    uploadedBy: string;
  };

  signatories: Signatory[];

  /** A scan of a page somebody signed by hand. Alongside `original`, not
   *  instead of it: a set of minutes can have both the Word file it was
   *  written from and a photograph of the signed page. */
  signedCopy?: {
    filename: string;
    contentType: string;
    size: number;
    uploadedAt: string;
    uploadedBy: string;
    /** What the minutes said when the paper copy was signed. */
    documentHash: string;
  };

  /**
   * Who was asked to check the current draft. Frozen when it is sent, the way
   * approvalEngine freezes required approvers at submission: somebody added
   * to the distribution tag tomorrow must not un-complete a round of review
   * that finished today.
   */
  reviewers?: MinutesReviewer[];

  /** Every response, all rounds. Kept as a list, because a second round of
   *  review must not erase what the first round asked for; each carries the
   *  draft it answered so old approvals cannot count for a new draft. */
  reviews: MinutesReview[];

  /** Bumped every time it goes out for checking. "Draft 1", "Draft 2". */
  draftNumber: number;

  createdAt: string;
  createdBy: string;
  updatedAt: string;
  /** Set once every signatory has signed. Nothing may change after this. */
  signedAt?: string;
}

const DIR = "minutes";
const recordPath = (id: string) => `${DIR}/${id}/record.json`;

export async function getMinutes(id: string): Promise<MinutesRecord | null> {
  return readJson<MinutesRecord | null>(recordPath(id), null);
}

/** Every set of minutes, newest period first. Enumerated from storage rather
 *  than an index, so a record cannot exist and be invisible. */
export async function listMinutes(): Promise<MinutesRecord[]> {
  const ids = await listFiles(DIR);
  const all = await Promise.all(ids.map((id) => getMinutes(id)));
  return all
    .filter((m): m is MinutesRecord => m !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export class MinutesLockedError extends Error {
  constructor(readonly id: string) {
    super("These minutes have been signed and can no longer be changed.");
    this.name = "MinutesLockedError";
  }
}

export async function createMinutes(
  input: Omit<
    MinutesRecord,
    "id" | "createdAt" | "updatedAt" | "status" | "signatories" | "reviews" | "draftNumber"
  > & { id?: string }
): Promise<MinutesRecord> {
  const now = new Date().toISOString();
  const record: MinutesRecord = {
    ...input,
    id: input.id || crypto.randomUUID(),
    status: "draft",
    signatories: [],
    reviews: [],
    draftNumber: 0,
    createdAt: now,
    updatedAt: now,
  };
  await writeJson(recordPath(record.id), record);
  return record;
}

/**
 * Updates minutes.
 *
 * 🔴 REFUSES once signed. Carl: "they cannot be edited once signed." That is
 * not a UI rule, it is the whole point of signing them, so it is enforced here
 * where every writer must pass rather than in each caller.
 */
export async function updateMinutes(
  id: string,
  updates: Partial<Omit<MinutesRecord, "id" | "createdAt" | "createdBy">>
): Promise<MinutesRecord | null> {
  const existing = await getMinutes(id);
  if (!existing) return null;
  if (isLocked(existing.status)) throw new MinutesLockedError(id);

  const next: MinutesRecord = {
    ...existing,
    ...updates,
    id: existing.id,
    createdAt: existing.createdAt,
    createdBy: existing.createdBy,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(recordPath(id), next);
  // Returned so the caller can render what was SAVED. A read straight after a
  // write can still serve the previous copy.
  return next;
}

/** Deletes minutes entirely. Only ever for a draft: a signed set is a record
 *  the school is legally required to keep. */
export async function deleteMinutes(id: string): Promise<boolean> {
  const existing = await getMinutes(id);
  if (!existing) return false;
  if (isLocked(existing.status)) throw new MinutesLockedError(id);
  await deleteFile(recordPath(id));
  if (existing.original) {
    await deleteFile(`${DIR}/${id}/original${extensionOf(existing.original.filename)}`);
  }
  return true;
}

function extensionOf(filename: string): string {
  const m = /(\.[a-zA-Z0-9]{1,8})$/.exec(filename || "");
  return m ? m[1].toLowerCase() : "";
}

export async function saveOriginalFile(
  id: string,
  bytes: Buffer,
  filename: string,
  contentType: string,
  uploadedBy: string
): Promise<MinutesRecord | null> {
  const existing = await getMinutes(id);
  if (!existing) return null;
  if (isLocked(existing.status)) throw new MinutesLockedError(id);

  await writeFile(`${DIR}/${id}/original${extensionOf(filename)}`, bytes);
  return updateMinutes(id, {
    original: {
      filename,
      contentType,
      size: bytes.length,
      uploadedAt: new Date().toISOString(),
      uploadedBy,
    },
  });
}

export async function readOriginalFile(id: string): Promise<Buffer | null> {
  const record = await getMinutes(id);
  if (!record?.original) return null;
  return readFile(`${DIR}/${id}/original${extensionOf(record.original.filename)}`);
}

// ---------------------------------------------------------------------------
// The Word LETTERHEAD: the file carrying the school's logo and footer.
//
// ⚠️ Not to be confused with a MINUTES TEMPLATE (lib/minutesTemplates.ts),
// which is the reusable set of SECTIONS a secretary picks when starting a new
// set of minutes. Two different things that were briefly given one name.
//
// One letterhead per school, not one per set of minutes: a school has one
// letterhead, not one per meeting.
// ---------------------------------------------------------------------------

const TEMPLATE_PATH = "minutes-template/template.docx";
const TEMPLATE_META = "minutes-template/meta.json";

export interface LetterheadTemplate {
  filename: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
}

export async function getLetterheadMeta(): Promise<LetterheadTemplate | null> {
  return readJson<LetterheadTemplate | null>(TEMPLATE_META, null);
}

export async function saveLetterhead(
  bytes: Buffer,
  filename: string,
  contentType: string,
  uploadedBy: string
): Promise<LetterheadTemplate> {
  await writeFile(TEMPLATE_PATH, bytes);
  const meta: LetterheadTemplate = {
    filename,
    contentType,
    size: bytes.length,
    uploadedAt: new Date().toISOString(),
    uploadedBy,
  };
  await writeJson(TEMPLATE_META, meta);
  return meta;
}

export async function readLetterhead(): Promise<Buffer | null> {
  return readFile(TEMPLATE_PATH);
}

// ⚠️ Signing lives in lib/minutesSigning.ts, not here.
//
// 🔴 There used to be a second hashDocument/canonicalContent pair in this
// file. Nothing but a check script called it, while the sign route used the
// pair in minutesSigning. Two answers to "what was signed" is how a signature
// becomes unverifiable: the one under test drifts from the one that runs, and
// nobody finds out until a record is disputed. Deleted rather than kept as a
// convenience import.

// ---------------------------------------------------------------------------
// The WET INK copy.
//
// Carl: "add an option to download the final draft to MS Word so those who
// prefer a wet ink signature can sign and then upload."
//
// A scan of a page somebody actually signed. It closes the minutes exactly as
// the code-based route does, and it is stored alongside rather than replacing
// the original upload: a set of minutes can have a Word file it was written
// from AND a scan of the signed page.
// ---------------------------------------------------------------------------

export async function saveSignedCopy(
  id: string,
  bytes: Buffer,
  filename: string,
  contentType: string,
  uploadedBy: string,
  /** What the minutes said when the paper copy was signed. A wet ink signature
   *  is bound to a version exactly as an electronic one is, or "signed" would
   *  mean less on paper than it does in the app. */
  documentHash: string
): Promise<MinutesRecord | null> {
  const existing = await getMinutes(id);
  if (!existing) return null;
  if (isLocked(existing.status)) throw new MinutesLockedError(id);

  await writeFile(`${DIR}/${id}/signed${extensionOf(filename)}`, bytes);
  const now = new Date().toISOString();
  return updateMinutes(id, {
    signedCopy: {
      filename,
      contentType,
      size: bytes.length,
      uploadedAt: now,
      uploadedBy,
      documentHash,
    },
    status: "signed",
    signedAt: now,
  });
}

export async function readSignedCopy(id: string): Promise<Buffer | null> {
  const record = await getMinutes(id);
  if (!record?.signedCopy) return null;
  return readFile(`${DIR}/${id}/signed${extensionOf(record.signedCopy.filename)}`);
}

// ---------------------------------------------------------------------------
// The signature MARK: the drawn or typed squiggle, as a PNG.
//
// One blob per signatory, under the minutes it belongs to. Kept out of
// record.json deliberately: a base64 image inside the record would be read and
// rewritten on every unrelated save, and a set of minutes with five signatures
// would carry a few hundred KB of image through every edit.
// ---------------------------------------------------------------------------

const signaturePath = (id: string, personKey: string) =>
  `${DIR}/${id}/signatures/${personKey}.png`;

/** Keyed on the signatory's EMAIL, normalised, not their personId: somebody can
 *  be on the signing list without a People-register entry, and personId is ""
 *  for them. Two such signatories would otherwise overwrite each other. */
export function signatureKey(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
}

export async function saveSignatureImage(
  id: string,
  email: string,
  png: Buffer
): Promise<void> {
  await writeFile(signaturePath(id, signatureKey(email)), png);
}

export async function readSignatureImage(
  id: string,
  email: string
): Promise<Buffer | null> {
  return readFile(signaturePath(id, signatureKey(email)));
}
