import { readJson, writeJson, writeFile, readFile, addToList, removeFromList } from "./controlData";

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

// Guarded writes (lib/controlData.ts): two guidelines uploaded together both stay.
export async function createGuideline(guideline: GuidelineMeta): Promise<void> {
  await addToList(GUIDELINES_INDEX, guideline);
}

export async function deleteGuideline(id: string): Promise<boolean> {
  return (await removeFromList<GuidelineMeta>(GUIDELINES_INDEX, id)) !== null;
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
