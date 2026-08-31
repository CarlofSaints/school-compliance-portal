import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requirePermission } from "@/lib/rolesData";
import {
  getPolicyById,
  deletePolicy,
  getPolicyVersions,
  getComplianceChecks,
  updatePolicy,
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

// Edit a policy's own details. Until this existed, name, description and
// category could only ever be set at upload: updatePolicy was in the library
// with nothing calling it, so a policy filed under the wrong category stayed
// there for good.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "manage_policies");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  try {
    const body = await req.json();
    const updates: { name?: string; description?: string; category?: string } =
      {};

    // Only fields actually present are touched, so sending a category cannot
    // blank out the description.
    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }
    if (typeof body.description === "string") {
      updates.description = body.description.trim();
    }
    if (typeof body.category === "string" && body.category.trim()) {
      updates.category = body.category.trim();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const updated = await updatePolicy(id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
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
