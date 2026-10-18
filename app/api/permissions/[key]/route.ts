import { NextRequest, NextResponse } from "next/server";
import { requirePermission, deletePermission, isBuiltInPermission } from "@/lib/rolesData";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const session = await requirePermission(req, "manage_roles");
  if (session instanceof NextResponse) return session;

  const { key } = await params;
  // Built-in ones always come back on the Roles page (permissionsForDisplay),
  // so deleting one would report success and change nothing.
  if (isBuiltInPermission(key)) {
    return NextResponse.json(
      { error: "Built-in permissions cannot be deleted. Untick it on the roles instead." },
      { status: 400 }
    );
  }
  const deleted = await deletePermission(key);
  if (!deleted) {
    return NextResponse.json(
      { error: "Permission not found" },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true });
}
