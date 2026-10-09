import { NextRequest, NextResponse } from "next/server";
import { readJson, writeJson } from "./controlData";
import { Role, Permission, SessionPayload, ALL_PERMISSION_KEYS } from "./roles";
import { getUserById } from "./userData";
import {
  SESSION_COOKIE,
  readSessionClaims,
  verifySessionToken,
  isSameOriginWrite,
  issuedAt,
  FRESH_TOKEN_MS,
} from "./session";
import { tenantScope } from "./tenantContext";

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
// 🔴 The ONLY place a request becomes a person. It reads the signed session
// cookie (lib/session.ts) and nothing else: the old x-user-id header is
// ignored, because it was a value the browser chose.
export async function getSessionFromRequest(
  req: NextRequest
): Promise<SessionPayload | null> {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!isSameOriginWrite(req.method, req.headers.get("origin"), host)) return null;

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const claims = readSessionClaims(token);
  if (!token || !claims) return null;

  let user = await getUserById(claims.u);
  if (!user) return null;
  const { key: tenantKey } = await tenantScope();
  if (!verifySessionToken(token, user, tenantKey)) {
    // ⚠️ A blob overwrite can take a second or two to show everywhere, so the
    // request straight after a password change may read the OLD hash while
    // holding a cookie signed against the NEW one. Refusing it would sign the
    // person out the moment they set their password. A token issued in the
    // last few seconds gets a short re-read first; anything older, or a
    // forgery, is refused exactly as before (it costs its own request time).
    if (Date.now() - issuedAt(claims) > FRESH_TOKEN_MS) return null;
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      await new Promise((r) => setTimeout(r, 700));
      user = await getUserById(claims.u);
      ok = !!user && verifySessionToken(token, user, tenantKey);
    }
    if (!ok || !user) return null;
  }

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

// Passes when the session holds ANY of the listed permissions. Used where a
// narrower read permission sits alongside a broader manage one.
export async function requireAnyPermission(
  req: NextRequest,
  permissionKeys: string[]
): Promise<SessionPayload | NextResponse> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!permissionKeys.some((k) => session.permissions.includes(k))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

// --- Who may hand out or touch which role ---------------------------------
//
// manage_users lets an SGB Admin run the user list, but it must not be a way
// to gain what they were not given. Without this, PUT /api/users/<own id>
// with { role: "super-admin" } made an SGB Admin a Super Admin, and they could
// reset the Super Admin's password.
//
// The rule: you may only give a role, or edit, delete or reset a user holding
// a role, whose permissions you hold ALL of yourself. Super Admin holds every
// permission, so it can do anything; an SGB Admin can manage SGB Members.
export async function roleWithinReach(
  session: { permissions: string[] },
  roleId: string
): Promise<boolean> {
  const roles = await getRoles();
  const role = roles.find((x) => x.id === roleId);
  // A role that no longer exists grants nothing, so it is within anyone's
  // reach: refusing here made users left on a deleted role uneditable by
  // everybody, the Super Admin included. Whether a role may be GIVEN is a
  // separate question, answered by roleExists.
  const needed = resolveRolePermissions(roleId, role);
  return needed.every((p) => session.permissions.includes(p));
}

/** Only a real role may be handed out. */
export async function roleExists(roleId: string): Promise<boolean> {
  if (roleId === SUPER_ADMIN_ROLE_ID) return true;
  return (await getRoles()).some((r) => r.id === roleId);
}

/** Tags carry approval authority (Principal, FINCOM). Nobody changes the
 *  tags on their OWN login, or on the People entry linked to it, unless they
 *  hold manage_roles: otherwise an SGB Admin could tag themselves FINCOM and
 *  become a required approver on every large application. */
export function maySelfTag(session: { permissions: string[] }): boolean {
  return session.permissions.includes("manage_roles");
}

export function sameIds(a: string[] | undefined, b: string[] | undefined): boolean {
  const x = [...(a || [])].sort().join("|");
  const y = [...(b || [])].sort().join("|");
  return x === y;
}
