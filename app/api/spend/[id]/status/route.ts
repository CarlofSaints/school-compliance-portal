import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { getSpendById, updateSpendApplication } from "@/lib/spendData";
import type { SpendApplication } from "@/lib/spendData";

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
  try {
    ({ status } = await req.json());
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

  // Approving from the grid skips the approvers the band asked for, so only a
  // spend admin may do it (approve_spend holders decide on the application
  // itself, where their vote is recorded). Moving an approved project on to
  // completed is bookkeeping and stays open to both.
  const alreadyApproved = app.status === "approved" || app.status === "completed";
  if (
    (next === "approved" || next === "completed") &&
    !alreadyApproved &&
    !session.permissions.includes("manage_spend_settings")
  ) {
    return NextResponse.json(
      {
        error:
          "Only a spend admin can set a project to approved or completed from the grid. Approvers decide on the application itself.",
      },
      { status: 403 }
    );
  }

  const updates: Partial<SpendApplication> = { status: next };

  // Changing the status from the grid has no quote selection behind it, so
  // fall back to the estimate rather than leaving the approved amount empty.
  // "Total Approved Spend" and the CAPEX report both sum approvedAmount, so a
  // row without one silently counts as zero. Completed counts too - a project
  // can be marked completed straight from the grid without passing through
  // approved.
  if (
    (next === "approved" || next === "completed") &&
    app.approvedAmount === undefined
  ) {
    updates.approvedAmount = app.estimatedAmount;
  }

  const updated = await updateSpendApplication(id, updates);

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
