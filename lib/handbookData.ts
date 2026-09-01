import { readJson, writeJson, writeFile, readFile } from "./controlData";

// The user guide, stored per school.
//
// Deliberately in blob storage rather than as a file in the repo: the repo is
// public, and the guide's screenshots carry real names off the register,
// project names and the school's CAPEX figures. Here it is behind the same
// login as everything else, and each school keeps its own.
const HTML_PATH = "handbook/handbook.html";
const META_PATH = "handbook/meta.json";

export interface HandbookMeta {
  uploadedAt: string;
  uploadedBy: string;
  uploadedByName: string;
  bytes: number;
  title: string;
}

export async function getHandbookMeta(): Promise<HandbookMeta | null> {
  return readJson<HandbookMeta | null>(META_PATH, null);
}

export async function getHandbookHtml(): Promise<string | null> {
  const buffer = await readFile(HTML_PATH);
  return buffer ? buffer.toString("utf8") : null;
}

export async function saveHandbook(
  html: string,
  meta: Omit<HandbookMeta, "bytes">
): Promise<HandbookMeta> {
  const buffer = Buffer.from(html, "utf8");
  // The document itself first. If writing the meta is the step that fails, the
  // guide is still readable; the other way round would advertise a guide that
  // is not there.
  await writeFile(HTML_PATH, buffer);
  const full: HandbookMeta = { ...meta, bytes: buffer.length };
  await writeJson(META_PATH, full);
  return full;
}
