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
      { error: "This is one of the portal's own permissions, so it cannot be removed. Untick it on each role instead." },
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
