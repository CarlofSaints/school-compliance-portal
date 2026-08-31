import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requirePermission } from "@/lib/rolesData";
import {
  getPolicyById,
  deletePolicy,
  getPolicyVersions,
  getComplianceChecks,
} from "@/lib/policyData";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const policy = await getPolicyById(id);
  if (!policy) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  const versions = await getPolicyVersions(id);
  const checks = await getComplianceChecks(id);

  return NextResponse.json({ policy, versions, checks });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "manage_policies");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const deleted = await deletePolicy(id);
  if (!deleted) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
