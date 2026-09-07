import crypto from "crypto";
import { DEFAULT_PERMISSIONS, DEFAULT_ROLES } from "./roles";
import {
  getPermissions,
  savePermissions,
  getRoles,
  saveRoles,
} from "./rolesData";
import { getUsers, createUser } from "./userData";
import type { User } from "./userData";
import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Standing up a school's own data: its permissions, its roles, its first admin.
//
// 🔴 Shared, because this happens two ways and they must not drift: the seed
// route for the two schools that predate multi-tenancy, and provisioning for
// every school created from now on. A provisioning path that seeded a slightly
// different set of roles would give new schools a portal subtly unlike the one
// the guide describes.
//
// Everything here writes through lib/controlData, so it lands in whichever
// school's store is currently in scope. Provisioning calls it inside
// runAsTenant(); the seed route calls it for the deployment's own school.
// ---------------------------------------------------------------------------

export interface SeedOutcome {
  notes: string[];
  /** The admin account, when this call created one. Absent when a super admin
   *  already existed, which is what makes re-running safe. */
  admin?: User;
}

/**
 * Permissions and roles, ADDITIVELY.
 *
 * 🔴 Never rewrites a role that already exists. A stored role predating a new
 * permission key does not gain it, which is deliberate: silently granting an
 * existing role a new power is how somebody ends up with access nobody chose
 * to give them. New keys become tickable on the Roles page instead.
 */
async function seedRolesAndPermissions(notes: string[]): Promise<void> {
  const existingPerms = await getPermissions();
  if (existingPerms.length === 0) {
    await savePermissions(DEFAULT_PERMISSIONS);
    notes.push(`Created ${DEFAULT_PERMISSIONS.length} permissions`);
  } else {
    const have = new Set(existingPerms.map((p) => p.key));
    const added = DEFAULT_PERMISSIONS.filter((p) => !have.has(p.key));
    if (added.length > 0) {
      await savePermissions([...existingPerms, ...added]);
      notes.push(`Added ${added.length} new permissions`);
    } else {
      notes.push("Permissions already up to date");
    }
  }

  const existingRoles = await getRoles();
  if (existingRoles.length === 0) {
    await saveRoles(DEFAULT_ROLES);
    notes.push(`Created ${DEFAULT_ROLES.length} roles`);
  } else {
    const have = new Set(existingRoles.map((r) => r.id));
    const added = DEFAULT_ROLES.filter((r) => !have.has(r.id));
    if (added.length > 0) {
      await saveRoles([...existingRoles, ...added]);
      notes.push(`Added ${added.length} new roles`);
    } else {
      notes.push("Roles already up to date");
    }
  }
}

/**
 * Seeds a school and creates its first administrator.
 *
 * 🔴 The password is RANDOM and is never returned, logged or emailed. The new
 * administrator receives a set-your-own-password link instead, exactly as
 * /api/users/[id]/notify does. A memorable starting password would have to
 * travel to them somehow, and every route it could travel by is one that keeps
 * a copy: an inbox, a WhatsApp thread, a terminal scrollback.
 *
 * It still has to EXIST, because a reset token is signed with the account's
 * current password hash. That is what makes the link single use: the moment
 * they set a password of their own, the link that set it dies.
 */
export async function seedSchool(input: {
  adminEmail: string;
  adminName?: string;
}): Promise<SeedOutcome> {
  const notes: string[] = [];
  await seedRolesAndPermissions(notes);

  const users = await getUsers();
  if (users.some((u) => u.role === "super-admin")) {
    // Re-running must not mint a second administrator. Idempotent on purpose:
    // provisioning can be retried after a partial failure.
    notes.push("An administrator already exists");
    return { notes };
  }

  const email = input.adminEmail.trim().toLowerCase();
  const [first, ...rest] = (input.adminName || "").trim().split(/\s+/);

  const admin = await createUser({
    id: uuidv4(),
    // Falls back to something a person would recognise rather than a blank
    // name in the corner of their own portal.
    name: first || "School",
    surname: rest.join(" ") || "Administrator",
    email,
    password: crypto.randomBytes(32).toString("base64url"),
    role: "super-admin",
    // They have never had a password, so they are not "changing" one. The link
    // they receive sets the first.
    forcePasswordChange: true,
  });

  notes.push(`Created the first administrator (${email})`);
  return { notes, admin };
}
