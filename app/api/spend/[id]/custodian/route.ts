import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getSpendById, updateSpendApplication } from "@/lib/spendData";
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
  try {
    ({ custodianUserId } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!custodianUserId) {
    const updated = await updateSpendApplication(id, {
      custodianUserId: undefined,
      custodianName: undefined,
    });
    return NextResponse.json({
      success: true,
      custodianUserId: updated?.custodianUserId,
      custodianName: updated?.custodianName,
    });
  }

  const users = await getUsers();
  const user = users.find((u) => u.id === custodianUserId);
  if (!user) {
    return NextResponse.json({ error: "Unknown user" }, { status: 400 });
  }

  // The name is stored alongside the id so the grid still reads correctly if
  // that user is later removed.
  const updated = await updateSpendApplication(id, {
    custodianUserId: user.id,
    custodianName: `${user.name} ${user.surname}`.trim(),
  });
  return NextResponse.json({
    success: true,
    custodianUserId: updated?.custodianUserId,
    custodianName: updated?.custodianName,
  });
}
