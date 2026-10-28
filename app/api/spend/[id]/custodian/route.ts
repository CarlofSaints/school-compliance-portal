import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getSpendById, updateSpendApplication, SpendChangeRefused } from "@/lib/spendData";
import { getUsers } from "@/lib/userData";

// Set the project's custodian from the grid. Sending an empty custodianUserId
// clears it, which puts the row back to following the applicant.
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

  let custodianUserId: string | undefined;
  let expectedRev: string | undefined;
  try {
    const body = await req.json();
    custodianUserId = body?.custodianUserId;
    expectedRev = typeof body?.expectedRev === "string" ? body.expectedRev : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Refused, not written, if someone else saved the row since the grid loaded it.
  const save = (fields: { custodianUserId?: string; custodianName?: string }) =>
    updateSpendApplication(id, fields, {
      expectedRev,
      byName: `${session.name} ${session.surname}`.trim(),
    });

  try {
    if (!custodianUserId) {
      const updated = await save({
        custodianUserId: undefined,
        custodianName: undefined,
      });
      return NextResponse.json({
        success: true,
        custodianUserId: updated?.custodianUserId,
        custodianName: updated?.custodianName,
        rev: updated?.rev,
      });
    }

    const users = await getUsers();
    const user = users.find((u) => u.id === custodianUserId);
    if (!user) {
      return NextResponse.json({ error: "Unknown user" }, { status: 400 });
    }

    // The name is stored alongside the id so the grid still reads correctly if
    // that user is later removed.
    const updated = await save({
      custodianUserId: user.id,
      custodianName: `${user.name} ${user.surname}`.trim(),
    });
    return NextResponse.json({
      success: true,
      custodianUserId: updated?.custodianUserId,
      custodianName: updated?.custodianName,
      rev: updated?.rev,
    });
  } catch (err) {
    if (err instanceof SpendChangeRefused) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
