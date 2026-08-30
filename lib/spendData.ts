import {
  readJson,
  writeJson,
  writeFile,
  readFile,
  deleteFile,
} from "./controlData";

export interface QuoteDetail {
  supplierName: string;
  supplierWebsite?: string;
  supplierEmail: string;
  supplierPhone?: string;
  priceExclVat: number;
}

// A single funding-source allocation on a request. A request may be split
// across several sources (e.g. R50k CAPEX + R20k Fundraising), so the amounts
// here should sum to the request's estimated amount.
export interface FundingAllocation {
  source: string;
  amount: number;
}

export interface SpendApplication {
  id: string;
  projectName: string;
  description: string;
  estimatedAmount: number;
  supplierConnection: string;
  budgeted: boolean;
  sourceOfFunds: string; // legacy: comma-joined source names (kept for display)
  fundingAllocations?: FundingAllocation[]; // per-source split (new)
  quotes: string[]; // file paths
  quoteDetails: QuoteDetail[];
  status:
    | "pending"
    | "pending_decision"
    | "approved"
    | "rejected"
    | "requires_changes"
    | "completed";
  submittedBy: string;
  submittedByName: string;
  submittedAt: string;
  // Manually-tracked execution progress, independent of the approval status.
  projectProgress?: "not_started" | "in_progress" | "completed";
  approvals: SpendApproval[];
  // Applicant (on-behalf-of) fields
  applicantName: string;
  applicantSurname: string;
  applicantEmail: string;
  submittedOnBehalf: boolean;
  // Quote selection
  preferredQuotes: { userId: string; quoteIndex: number }[];
  selectedQuoteIndex?: number;
  approvedAmount?: number;
  // Set on applications created by a bulk project-list import. The batch id is
  // what makes an import undoable - there is no other delete path for a spend
  // application, so a mis-mapped import would otherwise be permanent.
  importBatchId?: string;
  importedFrom?: string;
  // Completion fields
  completedAt?: string;
  completedBy?: string;
  finishedOnTime?: boolean;
  finishedWithinBudget?: boolean;
  budgetOverrunAmount?: number;
  budgetOverrunExplanation?: string;
}

export interface SpendApproval {
  userId: string;
  userName: string;
  position: string;
  decision: "approved" | "rejected" | "requires_changes";
  comments: string;
  decidedAt: string;
  preferredQuoteIndex?: number;
}

// Returns the per-source split for an application, falling back to a single
// allocation derived from the legacy `sourceOfFunds` string for older records
// that predate splitting.
export function getFundingAllocations(
  app: Pick<
    SpendApplication,
    "fundingAllocations" | "sourceOfFunds" | "estimatedAmount"
  >
): FundingAllocation[] {
  if (app.fundingAllocations && app.fundingAllocations.length > 0) {
    return app.fundingAllocations;
  }
  return [
    {
      source: app.sourceOfFunds || "Other",
      amount: app.estimatedAmount || 0,
    },
  ];
}

export const STATUS_DISPLAY: Record<string, string> = {
  pending: "APPLIED",
  pending_decision: "PENDING DECISION",
  approved: "APPROVED",
  rejected: "DECLINED",
  requires_changes: "NEEDS MORE WORK",
  completed: "COMPLETED",
};

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
