import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { getRoles, createRole, resolveRolePermissions, SUPER_ADMIN_ROLE_ID } from "@/lib/rolesData";

export async function GET(req: NextRequest) {
  const session = await requirePermission(req, "manage_roles");
  if (session instanceof NextResponse) return session;

  // Super Admin always holds every permission (resolveRolePermissions), so the
  // Roles page shows it that way, including keys added after it was stored.
  const roles = await getRoles();
  return NextResponse.json(
    roles.map((r) => (r.id === SUPER_ADMIN_ROLE_ID ? { ...r, permissions: resolveRolePermissions(r.id, r) } : r))
  );
}

export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_roles");
  if (session instanceof NextResponse) return session;

  try {
    const body = await req.json();
    const { id, name, permissions } = body;
    if (!id || !name) {
      return NextResponse.json(
        { error: "ID and name are required" },
        { status: 400 }
      );
    }

    const roles = await getRoles();
    if (roles.some((r) => r.id === id)) {
      return NextResponse.json(
        { error: "Role ID already exists" },
        { status: 409 }
      );
    }

    await createRole({ id, name, permissions: permissions || [] });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
