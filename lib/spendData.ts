import {
  readJson,
  writeJson,
  writeFile,
  readFile,
  deleteFile,
} from "./controlData";
import type { SpendApplication, QuoteDetail } from "./spend";

// Types and pure helpers live in lib/spend.ts so client components can reach
// them without pulling this module into the browser bundle. Re-exported so
// every existing `from "@/lib/spendData"` keeps working.
export * from "./spend";

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

// Batch equivalent of createSpendApplication for bulk import. Reads and writes
// the shared index ONCE for the whole batch - creating them one at a time would
// re-read and re-write the index per row.
export async function createSpendApplications(
  newApps: SpendApplication[]
): Promise<void> {
  if (newApps.length === 0) return;
  const apps = await getSpendApplications();
  apps.push(...newApps);
  await saveSpendApplications(apps);
  for (const app of newApps) {
    await writeJson(`spend/${app.id}.json`, app);
  }
}

// Removes every application created by one import batch. Returns how many were
// removed. Only ever called with a batch id, so it cannot touch an application
// somebody captured by hand.
export async function deleteSpendImportBatch(
  batchId: string
): Promise<number> {
  const apps = await getSpendApplications();
  const doomed = apps.filter((a) => a.importBatchId === batchId);
  if (doomed.length === 0) return 0;
  await saveSpendApplications(
    apps.filter((a) => a.importBatchId !== batchId)
  );
  for (const app of doomed) {
    // Best effort: the index is the source of truth for the list, so a failed
    // per-application blob delete must not fail the undo.
    try {
      await deleteFile(`spend/${app.id}.json`);
    } catch {
      // ignore
    }
  }
  return doomed.length;
}

// Removes one application, its per-application record and any quote files it
// uploaded. Returns the removed record so a caller can report what went.
export async function deleteSpendApplication(
  id: string
): Promise<SpendApplication | null> {
  const apps = await getSpendApplications();
  const app = apps.find((a) => a.id === id);
  if (!app) return null;

  await saveSpendApplications(apps.filter((a) => a.id !== id));

  // Best effort: the index is the source of truth for the list, so a failed
  // blob delete must not leave the record half-removed.
  for (const path of [...app.quotes, `spend/${id}.json`]) {
    try {
      await deleteFile(path);
    } catch {
      // ignore
    }
  }
  return app;
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
