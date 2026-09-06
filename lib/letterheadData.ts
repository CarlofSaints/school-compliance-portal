import { readJson, writeJson, readFile, writeFile, deleteFile } from "./controlData";

// ---------------------------------------------------------------------------
// Storage for the school’s Word letterhead. The marker list and the rules live
// in lib/letterhead.ts, which is pure so the admin screen can import it.
// ---------------------------------------------------------------------------

const FILE = "branding/letterhead.docx";
const META = "branding/letterhead.json";

export interface LetterheadMeta {
  filename: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
  /** Which placeholders their file actually contains, found at upload time.
   *  Stored so the admin screen can say what this letterhead will fill in
   *  without re-opening the file on every page load. */
  placeholders: string[];
}

export async function getLetterhead(): Promise<LetterheadMeta | null> {
  return readJson<LetterheadMeta | null>(META, null);
}

export async function saveLetterhead(
  bytes: Buffer,
  filename: string,
  uploadedBy: string,
  placeholders: string[]
): Promise<LetterheadMeta> {
  await writeFile(FILE, bytes);
  const meta: LetterheadMeta = {
    filename,
    size: bytes.length,
    uploadedAt: new Date().toISOString(),
    uploadedBy,
    placeholders,
  };
  await writeJson(META, meta);
  return meta;
}

/** The bytes, or null. Callers must treat null as "no letterhead" and generate
 *  their own document, never as an error: a school that has not uploaded one is
 *  the normal case. */
export async function readLetterheadFile(): Promise<Buffer | null> {
  const meta = await getLetterhead();
  if (!meta) return null;
  return readFile(FILE);
}

export async function removeLetterhead(): Promise<void> {
  // Meta first. If the delete of the bytes fails, the school still reads as
  // having no letterhead, which is what they asked for; the other order can
  // leave a record pointing at a file that is gone.
  await writeJson(META, null);
  await deleteFile(FILE).catch(() => {});
}
