// PURE spend types and helpers - no storage, no @vercel/blob, no next/headers.
//
// Split out of lib/spendData.ts for the same reason lib/tags.ts was split out
// of lib/tagData.ts: lib/spendReport.ts is documented as client-safe and IS
// imported by three client components, but it imported getFundingAllocations
// from the storage module, which dragged the whole blob layer into the browser
// bundle. That was silently shipping the blob SDK to visitors; it only became a
// build failure once the data layer began resolving the tenant from the
// request, since next/headers cannot exist in a browser bundle at all.
//
// lib/spendData.ts re-exports everything here, so server-side imports are
// unchanged.

import type { RequiredApprover } from "./approvalEngine";

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
  // --- Approval workflow, resolved when the application is submitted ---
  approvalTierId?: string;
  approvalTierLabel?: string;
  // True when the amount fell in a "logged only" band: recorded, no approval
  // needed, nobody chased.
  approvalLogOnly?: boolean;
  // The approvers this application needed, frozen at submission. See
  // lib/approvalEngine.ts for why this is a snapshot, not a live lookup.
  requiredApprovers?: RequiredApprover[];
  // Set when the bands could not name anybody, so the application is visibly
  // stuck rather than silently waiting forever.
  approvalWarning?: string;
  // Trail of manual "remind the approvers now" nudges. Kept so a chased
  // approver is a matter of record and so the cooldown has something to check.
  manualReminders?: ManualReminder[];
  // Notes live on the record itself rather than in a separate store, so the
  // grid's count is derived from the same data the detail page renders and
  // there is no second copy to fall out of step.
  notes?: SpendNote[];
  // Applicant (on-behalf-of) fields. applicantUserId points at the portal user
  // the request belongs to - the name/surname/email are kept alongside it so
  // older records (and anyone since removed as a user) still display.
  applicantUserId?: string;
  applicantName: string;
  applicantSurname: string;
  applicantEmail: string;
  submittedOnBehalf: boolean;
  // The person accountable for delivering the project. Unset means "same as
  // the applicant" - see getCustodian(). Storing it only once it is changed
  // means every existing record shows a custodian immediately, with no
  // migration to run and nothing to go stale.
  custodianUserId?: string;
  custodianName?: string;
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

// A free-text note anyone with sight of a project can add. Notes are an
// append-only record - the author and the moment are stamped on the note
// itself so the trail cannot drift from who actually wrote it.
export interface SpendNote {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export interface ManualReminder {
  at: string;
  byUserId: string;
  byName: string;
  sentTo: string[];
}

export interface SpendApproval {
  userId: string;
  userName: string;
  position: string;
  // "responded" is an approver asking a question or leaving a comment. It is
  // recorded and visible, but counts as NO decision - the application does not
  // move until they come back and actually approve or decline.
  decision: "approved" | "rejected" | "requires_changes" | "responded";
  comments: string;
  decidedAt: string;
  preferredQuoteIndex?: number;
  // Set on an admin override, which must always carry a reason.
  isOverride?: boolean;
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

// The custodian of a project, falling back to the applicant for every record
// created before custodians existed (and for any request where nobody has
// changed it). Client-safe - used by the grid as well as the reminder sender.
export function getCustodian(
  app: Pick<
    SpendApplication,
    | "custodianUserId"
    | "custodianName"
    | "applicantUserId"
    | "applicantName"
    | "applicantSurname"
  >
): { userId?: string; name: string } {
  if (app.custodianUserId || app.custodianName) {
    return { userId: app.custodianUserId, name: app.custodianName || "" };
  }
  return {
    userId: app.applicantUserId,
    name: `${app.applicantName || ""} ${app.applicantSurname || ""}`.trim(),
  };
}

export const STATUS_DISPLAY: Record<string, string> = {
  pending: "APPLIED",
  pending_decision: "PENDING DECISION",
  approved: "APPROVED",
  rejected: "DECLINED",
  requires_changes: "NEEDS MORE WORK",
  completed: "COMPLETED",
};
