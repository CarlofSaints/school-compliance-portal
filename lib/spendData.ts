import {
  readJson,
  writeJson,
  updateJson,
  NO_CHANGE,
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

// 🔴 The index is the source of truth, and every change to it goes through
// updateJson (lib/controlData.ts), which only writes if nobody else wrote since
// the read and otherwise re-applies the change. Before, two approvers deciding
// at the same moment kept one decision, and a new application could wipe a
// decision made the same second. The per-application file is a copy written
// after, from what the index now holds.

export async function getSpendApplications(): Promise<SpendApplication[]> {
  return readJson<SpendApplication[]>(SPEND_INDEX, []);
}

/** Replaces the whole list. Only for seeding demo data; everything else
 *  changes one application through updateSpendApplication. */
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
  await updateJson<SpendApplication[]>(SPEND_INDEX, [], (apps) => [...apps, app]);
  await writeJson(`spend/${app.id}.json`, app);
}

// Batch equivalent of createSpendApplication for bulk import: one guarded
// write of the index for the whole batch.
export async function createSpendApplications(
  newApps: SpendApplication[]
): Promise<void> {
  if (newApps.length === 0) return;
  await updateJson<SpendApplication[]>(SPEND_INDEX, [], (apps) => [...apps, ...newApps]);
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
  let doomed: SpendApplication[] = [];
  await updateJson<SpendApplication[]>(SPEND_INDEX, [], (apps) => {
    doomed = apps.filter((a) => a.importBatchId === batchId);
    return doomed.length ? apps.filter((a) => a.importBatchId !== batchId) : NO_CHANGE;
  });
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
  let app: SpendApplication | null = null;
  await updateJson<SpendApplication[]>(SPEND_INDEX, [], (apps) => {
    app = apps.find((a) => a.id === id) ?? null;
    return app ? apps.filter((a) => a.id !== id) : NO_CHANGE;
  });
  const removed = app as SpendApplication | null;
  if (!removed) return null;

  // Best effort: the index is the source of truth for the list, so a failed
  // blob delete must not leave the record half-removed.
  for (const path of [...removed.quotes, `spend/${id}.json`]) {
    try {
      await deleteFile(path);
    } catch {
      // ignore
    }
  }
  return removed;
}

/** A change to one application: fields to set, or a function of the
 *  application AS IT IS NOW. Use the function for anything that adds to a list
 *  on it (approvals, notes, reminder history), or that is worked out from one:
 *  a list built from an earlier read loses whatever was added in between. */
/** Thrown from inside a change to refuse it against the CURRENT record (it
 *  moved on since the request read it). Nothing is written; the message is
 *  for the person. */
export class SpendChangeRefused extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

export type SpendChange =
  | Partial<Omit<SpendApplication, "id">>
  | ((current: SpendApplication) => Partial<Omit<SpendApplication, "id">>);

export async function updateSpendApplication(
  id: string,
  change: SpendChange
): Promise<SpendApplication | null> {
  let updated: SpendApplication | null = null;
  await updateJson<SpendApplication[]>(SPEND_INDEX, [], (apps) => {
    const idx = apps.findIndex((a) => a.id === id);
    if (idx === -1) {
      updated = null;
      return NO_CHANGE;
    }
    const updates = typeof change === "function" ? change(apps[idx]) : change;
    apps[idx] = { ...apps[idx], ...updates };
    updated = apps[idx];
    return apps;
  });
  if (updated) await writeJson(`spend/${id}.json`, updated);
  return updated;
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

export type { QuoteDetail };
