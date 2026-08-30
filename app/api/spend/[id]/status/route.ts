import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
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
  const updates: Partial<SpendApplication> = { status: next };

  // Approving from the grid has no quote selection behind it, so fall back to
  // the estimate rather than leaving the approved amount empty - the CAPEX
  // report reads approvedAmount.
  if (next === "approved" && app.approvedAmount === undefined) {
    updates.approvedAmount = app.estimatedAmount;
  }

  const updated = await updateSpendApplication(id, updates);
  return NextResponse.json({ success: true, status: updated?.status });
}
