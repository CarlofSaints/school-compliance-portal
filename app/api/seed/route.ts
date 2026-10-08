import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_PERMISSIONS, DEFAULT_ROLES } from "@/lib/roles";
import { getPermissions, savePermissions, getRoles, saveRoles } from "@/lib/rolesData";
import { getUsers, createUser } from "@/lib/userData";
import { v4 as uuidv4 } from "uuid";
import { randomBytes, timingSafeEqual } from "node:crypto";

// Constant-time, and refuses outright when SEED_SECRET is unset.
function secretMatches(given: string | null): boolean {
  const expected = process.env.SEED_SECRET || "";
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secretMatches(secret)) {
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
      // A fresh random password, shown ONCE in this (secret-gated) response.
      // It used to be "Admin@123", which is printed in a public repository:
      // any store seeded and not yet signed into was open to anyone who read it.
      const password = randomBytes(12).toString("base64url");
      await createUser({
        id: uuidv4(),
        name: "Super",
        surname: "Admin",
        email: "carl@outerjoin.co.za",
        password,
        role: "super-admin",
        forcePasswordChange: true,
      });
      results.push(`Created super admin carl@outerjoin.co.za with temporary password ${password} (shown once; you must change it on first sign-in)`);
    } else {
      results.push("Super admin already exists");
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[seed] failed:", err);
    return NextResponse.json(
      { error: message, envCheck: { hasBlobToken: !!process.env.BLOB_READ_WRITE_TOKEN } },
      { status: 500 }
    );
  }
}
