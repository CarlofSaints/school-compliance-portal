import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { getSpendById, updateSpendApplication } from "@/lib/spendData";
import { spendRefusalResponse } from "@/lib/spendConflict";
import type { SpendApplication } from "@/lib/spendData";
import { isOwnApplication, isRegisterImport } from "@/lib/approvalEngine";

const VALID: SpendApplication["status"][] = [
  "pending",
  "pending_decision",
  "approved",
  "rejected",
  "requires_changes",
  "completed",
];

// Set a project's approval status directly from the grid, so an admin can
// correct a status without opening and re-saving the whole application.
// Approvals already recorded are left alone - this changes the outcome, not
// the history of who decided what.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const canManage =
    session.permissions.includes("approve_spend") ||
    session.permissions.includes("manage_spend_settings");
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const app = await getSpendById(id);
  if (!app) {
    return NextResponse.json(
      { error: "Spend application not found" },
      { status: 404 }
    );
  }

  let status: string | undefined;
  // The status the grid showed when it was changed: refused if someone else
  // changed it since (a note or a vote meanwhile refuses nothing).
  let expectedStatus: string | undefined;
  try {
    const body = await req.json();
    status = body?.status;
    expectedStatus = typeof body?.expectedStatus === "string" ? body.expectedStatus : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!status || !VALID.includes(status as SpendApplication["status"])) {
    return NextResponse.json(
      { error: "status must be one of: " + VALID.join(", ") },
      { status: 400 }
    );
  }

  const next = status as SpendApplication["status"];

  // Approving from the grid skips the vote on the application, so only a spend
  // admin may do it - except on an imported row nobody has to vote on (the
  // school's existing register being brought in; see isRegisterImport). An
  // approver on a live application decides on the application itself, where
  // their vote is recorded and every other approver still has their say.
  // Moving an approved project on to completed is bookkeeping and stays open.
  const alreadyApproved = app.status === "approved" || app.status === "completed";
  const approving = (next === "approved" || next === "completed") && !alreadyApproved;
  if (
    approving &&
    !session.permissions.includes("manage_spend_settings") &&
    !isRegisterImport(app)
  ) {
    return NextResponse.json(
      {
        error:
          "Only a spend admin can approve a project from the grid. If you are one of its approvers, open the project and click Approve, so your vote is recorded.",
      },
      { status: 403 }
    );
  }

  // The same rule as the approve route: nobody approves their own spending,
  // and the grid must not be the way round it. Capturing it for somebody else
  // does not make it yours.
  if (approving && isOwnApplication(app, session.id)) {
    return NextResponse.json(
      { error: "You cannot approve your own application. Another admin has to." },
      { status: 403 }
    );
  }

  // Changing the status from the grid has no quote selection behind it, so
  // fall back to the estimate rather than leaving the approved amount empty.
  // "Total Approved Spend" and the CAPEX report both sum approvedAmount, so a
  // row without one silently counts as zero. Completed counts too - a project
  // can be marked completed straight from the grid without passing through
  // approved. Worked out from the record AS IT IS AT SAVE TIME: an amount
  // edited meanwhile is the one approved.
  const updates = (current: SpendApplication): Partial<SpendApplication> => ({
    status: next,
    ...((next === "approved" || next === "completed") && current.approvedAmount === undefined
      ? { approvedAmount: current.estimatedAmount }
      : {}),
  });

  let updated;
  try {
    updated = await updateSpendApplication(id, updates, {
      // Always: the admin-only and own-application checks above were made on
      // the status read at the start, so it must not have moved since.
      base: { status: (expectedStatus ?? app.status) as SpendApplication["status"] },
      byName: actorFrom(req, session).actorName,
    });
  } catch (err) {
    const refused = await spendRefusalResponse(err);
    if (refused) return refused;
    throw err;
  }

  // A status set by hand, outside the approval flow, always leaves a trace.
  if (next !== app.status) {
    await recordActivity({
      ...actorFrom(req, session),
      action: "spend.status.set",
      entity: "spend",
      entityId: app.id,
      summary: `Set "${app.projectName}" from ${app.status} to ${next} in the grid`,
      detail: { from: app.status, to: next, amount: app.estimatedAmount },
    });
  }
  // approvedAmount is returned so the grid can update its totals without a
  // reload - the card is computed from the rows it already holds.
  return NextResponse.json({
    success: true,
    status: updated?.status,
    approvedAmount: updated?.approvedAmount,
  });
}
