import { readJson, writeJson, writeFile, readFile } from "./controlData";

export interface GuidelineMeta {
  id: string;
  name: string;
  description: string;
  source: string; // "GDE" | "DoE" | "SASA" | "BELA" | "Other"
  filename: string;
  ext: string;
  uploadedBy: string;
  uploadedAt: string;
  size: number;
}

const GUIDELINES_INDEX = "guidelines/index.json";

export async function getGuidelines(): Promise<GuidelineMeta[]> {
  return readJson<GuidelineMeta[]>(GUIDELINES_INDEX, []);
}

export async function saveGuidelines(
  guidelines: GuidelineMeta[]
): Promise<void> {
  return writeJson(GUIDELINES_INDEX, guidelines);
}

export async function getGuidelineById(
  id: string
): Promise<GuidelineMeta | undefined> {
  const guidelines = await getGuidelines();
  return guidelines.find((g) => g.id === id);
}

export async function createGuideline(guideline: GuidelineMeta): Promise<void> {
  const guidelines = await getGuidelines();
  guidelines.push(guideline);
  await saveGuidelines(guidelines);
}

export async function deleteGuideline(id: string): Promise<boolean> {
  const guidelines = await getGuidelines();
  const filtered = guidelines.filter((g) => g.id !== id);
  if (filtered.length === guidelines.length) return false;
  await saveGuidelines(filtered);
  return true;
}

export async function uploadGuidelineFile(
  id: string,
  ext: string,
  data: Buffer
): Promise<void> {
  await writeFile(`guidelines/${id}.${ext}`, data);
}

export async function downloadGuidelineFile(
  id: string,
  ext: string
): Promise<Buffer | null> {
  return readFile(`guidelines/${id}.${ext}`);
}
