import { NextRequest, NextResponse } from "next/server";
import { readJson, writeJson } from "./controlData";
import { Role, Permission, SessionPayload, ALL_PERMISSION_KEYS } from "./roles";
import { getUserById } from "./userData";

export const SUPER_ADMIN_ROLE_ID = "super-admin";

// Super Admin is defined in code as "every permission" (DEFAULT_ROLES), but a
// role record is only ever written at seed time and the seed skips a role that
// already exists. So a permission key added to the code later never reaches the
// stored array, and a Super Admin silently loses access to the new feature.
// Resolving it here means the code's definition wins for that one role.
export function resolveRolePermissions(roleId: string, role?: Role): string[] {
  const stored = role?.permissions || [];
  if (roleId === SUPER_ADMIN_ROLE_ID) {
    return [...new Set([...ALL_PERMISSION_KEYS, ...stored])];
  }
  return stored;
}

const ROLES_PATH = "roles.json";
const PERMISSIONS_PATH = "permissions.json";

// --- Roles CRUD ---
export async function getRoles(): Promise<Role[]> {
  return readJson<Role[]>(ROLES_PATH, []);
}

export async function saveRoles(roles: Role[]): Promise<void> {
  return writeJson(ROLES_PATH, roles);
}

export async function getRoleById(id: string): Promise<Role | undefined> {
  const roles = await getRoles();
  return roles.find((r) => r.id === id);
}

export async function createRole(role: Role): Promise<void> {
  const roles = await getRoles();
  roles.push(role);
  await saveRoles(roles);
}

export async function updateRole(
  id: string,
  updates: Partial<Omit<Role, "id">>
): Promise<Role | null> {
  const roles = await getRoles();
  const idx = roles.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  roles[idx] = { ...roles[idx], ...updates };
  await saveRoles(roles);
  return roles[idx];
}

export async function deleteRole(id: string): Promise<boolean> {
  const roles = await getRoles();
  const filtered = roles.filter((r) => r.id !== id);
  if (filtered.length === roles.length) return false;
  await saveRoles(filtered);
  return true;
}

// --- Permissions CRUD ---
export async function getPermissions(): Promise<Permission[]> {
  return readJson<Permission[]>(PERMISSIONS_PATH, []);
}

export async function savePermissions(perms: Permission[]): Promise<void> {
  return writeJson(PERMISSIONS_PATH, perms);
}

export async function createPermission(perm: Permission): Promise<void> {
  const perms = await getPermissions();
  perms.push(perm);
  await savePermissions(perms);
}

export async function deletePermission(key: string): Promise<boolean> {
  const perms = await getPermissions();
  const filtered = perms.filter((p) => p.key !== key);
  if (filtered.length === perms.length) return false;
  await savePermissions(filtered);
  return true;
}

// --- Server Auth Guards ---
export async function getSessionFromRequest(
  req: NextRequest
): Promise<SessionPayload | null> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return null;

  const user = await getUserById(userId);
  if (!user) return null;

  const roles = await getRoles();
  const role = roles.find((r) => r.id === user.role);

  return {
    id: user.id,
    name: user.name,
    surname: user.surname,
    email: user.email,
    role: user.role,
    roleName: role?.name || user.role,
    permissions: resolveRolePermissions(user.role, role),
  };
}

export async function requireLogin(
  req: NextRequest
): Promise<SessionPayload | NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

export async function requirePermission(
  req: NextRequest,
  permissionKey: string
): Promise<SessionPayload | NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.permissions.includes(permissionKey)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return session;
}
