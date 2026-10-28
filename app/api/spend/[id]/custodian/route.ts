import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getSpendById, updateSpendApplication } from "@/lib/spendData";
import { spendRefusalResponse } from "@/lib/spendConflict";
import { actorFrom } from "@/lib/activityActor";
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
  // The custodian the grid showed: refused if someone else changed it since.
  let expected: { custodianUserId?: string } | undefined;
  try {
    const body = await req.json();
    custodianUserId = body?.custodianUserId;
    if (body && "expectedCustodianUserId" in body) {
      expected = { custodianUserId: body.expectedCustodianUserId || undefined };
    }
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const save = (fields: { custodianUserId?: string; custodianName?: string }) =>
    updateSpendApplication(id, fields, {
      base: expected,
      byName: actorFrom(req, session).actorName,
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
    });
  } catch (err) {
    const refused = await spendRefusalResponse(err);
    if (refused) return refused;
    throw err;
  }
}
