import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_PERMISSIONS, DEFAULT_ROLES } from "@/lib/roles";
import { getPermissions, savePermissions, getRoles, saveRoles } from "@/lib/rolesData";
import { getUsers, createUser } from "@/lib/userData";
import { v4 as uuidv4 } from "uuid";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.SEED_SECRET) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 403 });
  }

  const results: string[] = [];

  try {
    // Seed permissions
    const existingPerms = await getPermissions();
    if (existingPerms.length === 0) {
      await savePermissions(DEFAULT_PERMISSIONS);
      results.push(`Created ${DEFAULT_PERMISSIONS.length} permissions`);
    } else {
      const existingKeys = new Set(existingPerms.map((p) => p.key));
      const newPerms = DEFAULT_PERMISSIONS.filter((p) => !existingKeys.has(p.key));
      if (newPerms.length > 0) {
        await savePermissions([...existingPerms, ...newPerms]);
        results.push(`Added ${newPerms.length} new permissions`);
      } else {
        results.push("Permissions already up to date");
      }
    }

    // Seed roles
    const existingRoles = await getRoles();
    if (existingRoles.length === 0) {
      await saveRoles(DEFAULT_ROLES);
      results.push(`Created ${DEFAULT_ROLES.length} roles`);
    } else {
      const existingIds = new Set(existingRoles.map((r) => r.id));
      const newRoles = DEFAULT_ROLES.filter((r) => !existingIds.has(r.id));
      if (newRoles.length > 0) {
        await saveRoles([...existingRoles, ...newRoles]);
        results.push(`Added ${newRoles.length} new roles`);
      } else {
        results.push("Roles already up to date");
      }
    }

    // Seed super admin
    const users = await getUsers();
    const hasSuperAdmin = users.some((u) => u.role === "super-admin");
    if (!hasSuperAdmin) {
      await createUser({
        id: uuidv4(),
        name: "Super",
        surname: "Admin",
        email: "carl@outerjoin.co.za",
        password: "Admin@123",
        role: "super-admin",
        forcePasswordChange: true,
      });
      results.push("Created super admin (carl@outerjoin.co.za / Admin@123)");
    } else {
      results.push("Super admin already exists");
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return NextResponse.json(
      { error: message, stack, envCheck: { hasBlobToken: !!process.env.BLOB_READ_WRITE_TOKEN } },
      { status: 500 }
    );
  }
}
