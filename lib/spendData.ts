import { readJson, writeJson, writeFile, readFile } from "./controlData";

export interface QuoteDetail {
  supplierName: string;
  supplierWebsite?: string;
  supplierEmail: string;
  supplierPhone?: string;
  priceExclVat: number;
}

export interface SpendApplication {
  id: string;
  projectName: string;
  description: string;
  estimatedAmount: number;
  supplierConnection: string;
  budgeted: boolean;
  sourceOfFunds: string;
  quotes: string[]; // file paths
  quoteDetails: QuoteDetail[];
  status: "pending" | "approved" | "rejected" | "requires_changes";
  submittedBy: string;
  submittedByName: string;
  submittedAt: string;
  approvals: SpendApproval[];
}

export interface SpendApproval {
  userId: string;
  userName: string;
  position: string;
  decision: "approved" | "rejected" | "requires_changes";
  comments: string;
  decidedAt: string;
}

const SPEND_INDEX = "spend/index.json";

export async function getSpendApplications(): Promise<SpendApplication[]> {
  return readJson<SpendApplication[]>(SPEND_INDEX, []);
}

export async function saveSpendApplications(
  apps: SpendApplication[]
): Promise<void> {
  return writeJson(SPEND_INDEX, apps);
}

export async function getSpendById(
  id: string
): Promise<SpendApplication | undefined> {
  const apps = await getSpendApplications();
  return apps.find((a) => a.id === id);
}

export async function createSpendApplication(
  app: SpendApplication
): Promise<void> {
  const apps = await getSpendApplications();
  apps.push(app);
  await saveSpendApplications(apps);
  await writeJson(`spend/${app.id}.json`, app);
}

export async function updateSpendApplication(
  id: string,
  updates: Partial<Omit<SpendApplication, "id">>
): Promise<SpendApplication | null> {
  const apps = await getSpendApplications();
  const idx = apps.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  apps[idx] = { ...apps[idx], ...updates };
  await saveSpendApplications(apps);
  await writeJson(`spend/${id}.json`, apps[idx]);
  return apps[idx];
}

export async function uploadQuoteFile(
  spendId: string,
  quoteNum: number,
  ext: string,
  data: Buffer
): Promise<string> {
  const path = `spend/${spendId}/quote-${quoteNum}.${ext}`;
  await writeFile(path, data);
  return path;
}

export async function downloadQuoteFile(
  path: string
): Promise<Buffer | null> {
  return readFile(path);
}
