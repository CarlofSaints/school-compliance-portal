import type { SpendApplication, SpendApproval } from "./spendData";
import type { ApprovalRequirement } from "./approvalSettings";

// The approvers an application needed, frozen at the moment it was submitted.
//
// Frozen on purpose: if the FINCOM gains a member next month, "everyone has
// approved" must not silently become false for an application already through
// the process. The tier and the names are part of the record of what was
// decided, not a live lookup.
export interface RequiredApprover {
  key: string;
  userId?: string;
  personId?: string;
  name: string;
  email: string;
  tagId: string;
  tagName: string;
  mode: "all" | "any";
}

export interface ApprovalProgress {
  // Counted in PEOPLE, which is what the grid shows as "1/3" - three FINCOM
  // members who must all approve read as 2/3 when two are in, not 0/1.
  // An "any one of" group counts as a single required approval, since only one
  // of its members is actually needed.
  approved: number;
  total: number;
  // Whether every requirement is satisfied. This, not approved === total, is
  // what decides the status.
  groupsApproved: number;
  groupsTotal: number;
  // Individuals still to respond.
  outstanding: RequiredApprover[];
  // Approvers who asked a question instead of deciding.
  responded: RequiredApprover[];
  complete: boolean;
  anyRejected: boolean;
}

// An approver can leave several entries: a question, then later a decision.
// The history keeps them all, so what counts is their LAST entry.
function decisionOf(
  approvals: SpendApproval[],
  approver: RequiredApprover
): SpendApproval | undefined {
  const mine = approvals.filter(
    (a) =>
      (approver.userId && a.userId === approver.userId) ||
      a.userId === approver.key
  );
  return mine[mine.length - 1];
}

// Groups the frozen approver list by tag so an "any one of" requirement is
// judged per tag rather than per person.
export function groupByTag(
  approvers: RequiredApprover[]
): { tagId: string; tagName: string; mode: "all" | "any"; members: RequiredApprover[] }[] {
  const groups = new Map<
    string,
    { tagId: string; tagName: string; mode: "all" | "any"; members: RequiredApprover[] }
  >();
  for (const a of approvers) {
    const existing = groups.get(a.tagId);
    if (existing) existing.members.push(a);
    else
      groups.set(a.tagId, {
        tagId: a.tagId,
        tagName: a.tagName,
        mode: a.mode,
        members: [a],
      });
  }
  return [...groups.values()];
}

// Where an application stands against the approvers it needed.
//
// A "responded" decision — an approver asking a question — deliberately counts
// as no decision at all. That is the whole point of the response option: it is
// visible to everyone but does not move the application forward.
export function evaluateProgress(
  app: Pick<SpendApplication, "approvals" | "requiredApprovers">
): ApprovalProgress {
  const required = app.requiredApprovers || [];
  const approvals = app.approvals || [];
  const groups = groupByTag(required);

  let approvedGroups = 0;
  let approvedPeople = 0;
  let totalPeople = 0;
  const outstanding: RequiredApprover[] = [];
  const responded: RequiredApprover[] = [];
  let anyRejected = false;

  for (const group of groups) {
    let satisfiedInGroup = 0;
    const groupOutstanding: RequiredApprover[] = [];

    for (const member of group.members) {
      const decision = decisionOf(approvals, member);
      if (decision?.decision === "approved") {
        satisfiedInGroup++;
      } else if (decision?.decision === "rejected") {
        anyRejected = true;
      } else {
        if (decision?.decision === "responded") responded.push(member);
        groupOutstanding.push(member);
      }
    }

    const groupSatisfied =
      group.mode === "any"
        ? satisfiedInGroup >= 1
        : satisfiedInGroup === group.members.length;

    if (groupSatisfied) approvedGroups++;
    else outstanding.push(...groupOutstanding);

    // "Any one of five" needs one signature, so it counts as one, not five.
    totalPeople += group.mode === "any" ? 1 : group.members.length;
    approvedPeople +=
      group.mode === "any" ? Math.min(1, satisfiedInGroup) : satisfiedInGroup;
  }

  return {
    approved: approvedPeople,
    total: totalPeople,
    groupsApproved: approvedGroups,
    groupsTotal: groups.length,
    outstanding,
    responded,
    complete: groups.length > 0 && approvedGroups === groups.length,
    anyRejected,
  };
}

// The status an application should now be in, given its approvals.
//
// Note what this deliberately will NOT do: it never returns "approved" unless
// every requirement is satisfied. An application with no required approvers at
// all stays where it is rather than sliding through — an empty requirement
// list means nobody has been told to look at it, not that everyone agreed.
export function deriveStatus(
  app: Pick<
    SpendApplication,
    "approvals" | "requiredApprovers" | "status" | "approvalLogOnly"
  >
): SpendApplication["status"] {
  if (app.approvalLogOnly) return app.status;

  const progress = evaluateProgress(app);

  if (progress.anyRejected) return "rejected";
  if (progress.complete) return "approved";

  const anyDecision = (app.approvals || []).some(
    (a) => a.decision === "approved" || a.decision === "responded"
  );
  return anyDecision ? "pending_decision" : "pending";
}

// Whether this session may record a decision on this application. Being on the
// frozen approver list is what grants it - not a permission - so adding
// somebody to a tag does not let them decide an application that was already
// under way without them.
export function isRequiredApprover(
  app: Pick<SpendApplication, "requiredApprovers">,
  userId: string
): boolean {
  return (app.requiredApprovers || []).some((a) => a.userId === userId);
}

/** Whether this is the person's OWN spending: they are the applicant, or they
 *  submitted it. The submitter is let off only when another PORTAL USER is the
 *  applicant (a secretary filing for a teacher) or the row was imported.
 *  🔴 Not on the "on behalf" tick or a typed-in name: those are the
 *  submitter's own say-so, and would let anyone approve their own spending. */
export function isOwnApplication(
  app: { submittedBy: string; applicantUserId?: string; importBatchId?: string },
  userId: string
): boolean {
  if (app.applicantUserId === userId) return true;
  if (app.submittedBy !== userId) return false;
  const someoneElseApplies = !!app.applicantUserId && app.applicantUserId !== userId;
  return !someoneElseApplies && !app.importBatchId;
}

/** Who may pick the quote, or close the project, on an APPROVED application:
 *  approve_spend AND (one of its required approvers or a spend admin), never
 *  on their own application (an imported row, or one with no approvers: any
 *  approve_spend holder but the applicant). The whole rule the routes apply, so the page shows the
 *  buttons to exactly these people. */
export function mayActOnApproved(
  app: Pick<SpendApplication, "requiredApprovers" | "submittedBy" | "applicantUserId" | "importBatchId">,
  user: { id: string; permissions: string[] }
): boolean {
  if (!user.permissions.includes("approve_spend")) return false;
  if (isOwnApplication(app, user.id)) return false;
  // An imported row (spend/import) names the importing admin as submitter, and
  // a log-only or untagged band has no approvers at all: any approve_spend
  // holder (the importer, the submitter included) may pick the quote or
  // complete it, as before.
  if (app.importBatchId || !app.requiredApprovers?.length) return true;
  return isRequiredApprover(app, user.id) || user.permissions.includes("manage_spend_settings");
}

// Names are passed in rather than looked up so this stays pure and usable on
// the client. personNames is keyed by person id, tagNames by tag id.
export function summariseRequirements(
  requirements: ApprovalRequirement[],
  tagNames: Record<string, string>,
  personNames: Record<string, string> = {}
): string {
  if (requirements.length === 0) return "No approver set";
  return requirements
    .map((r) => {
      // One named person is not a group, so "all of" would read oddly.
      if (r.personId) return personNames[r.personId] || "a removed person";
      if (!r.tagId) return "a removed approver";
      return `${r.mode === "all" ? "All" : "Any one"} of ${
        tagNames[r.tagId] || "a removed tag"
      }`;
    })
    .join(" + ");
}
