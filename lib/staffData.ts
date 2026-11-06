import { randomUUID } from "node:crypto";
import { NO_CHANGE } from "./controlData";
import { TERM_EXEMPT_POSITIONS } from "./governanceTerm";
import { STAFF_POSITION, changePeople, type Person } from "./peopleData";
import type { RowResult, StaffDetails } from "./staff";
import { createUsers, getUsers, updateUsersWhere, type User } from "./userData";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Staff still owed the email with their login link. The Staff page and the send must agree on this. */
export const awaitingLink = (u: User) => !!u.staff && u.forcePasswordChange && !u.staff.invitedAt && !u.retiredAt && !u.termLocked;

/** Came in through the Staff page and holds no real seat on the register, by link or by email. Off the weekly update. */
export const staffOnlyLogin = (u: User, people: Person[]) =>
  !!u.staff && !u.staff.hadLogin && !people.some((p) => !p.staffOnly && (p.userId === u.id || (!!p.email && same(p.email, u.email))));

const unchanged = (a: StaffDetails, b: StaffDetails) => (Object.keys(b) as (keyof StaffDetails)[]).every((k) => k === "invitedAt" || k === "hadLogin" || a[k] === b[k]);

/** Loads checked rows, each with no problems: new users, details on existing ones, and one register entry each. */
export async function loadStaff(good: RowResult[]): Promise<{ added: number; updated: number }> {
  const adds = good.filter((r) => r.action === "add");
  const details = new Map(good.filter((r) => r.action === "update").map((r) => [r.userId!, r.details as StaffDetails]));

  const created = await createUsers(
    adds.map((r) => ({
      id: randomUUID(),
      name: r.firstName,
      surname: r.surname,
      email: r.email,
      role: r.roleId,
      forcePasswordChange: true,
      tagIds: [],
      // Staff are not governors: the lock when an SGB term ends must not catch them.
      // Not set on an existing login: that person may hold an SGB role, so the Term page decides.
      keepsAccessAfterTerm: true,
      staff: r.details as StaffDetails,
    }))
  );
  // A row that changes nothing writes nothing, so a large re-upload stays quick.
  const updated = details.size
    ? await updateUsersWhere((u) => {
        const row = details.get(u.id);
        if (!row) return null;
        // A blank cell keeps the number already stored: SACE and Persal can be blank on a Coach row.
        const next = { ...row, sace: row.sace || u.staff?.sace || "", persal: row.persal || u.staff?.persal || "" };
        if (u.staff && unchanged(u.staff, next)) return null;
        return { staff: { ...next, invitedAt: u.staff?.invitedAt, hadLogin: u.staff ? u.staff.hadLogin : true } };
      })
    : [];

  const existing = details.size ? (await getUsers()).filter((u) => details.has(u.id)) : [];
  const onRegister = [...created, ...existing];
  await changePeople((people) => {
    const next = [...people];
    let changed = false;
    for (const u of onRegister) {
      if (next.some((x) => x.userId === u.id)) continue;
      const unlinked = next.findIndex((x) => !x.userId && x.email && same(x.email, u.email));
      if (unlinked >= 0) {
        // The Principal and Deputy hold power by this link, so an upload never makes it.
        if (TERM_EXEMPT_POSITIONS.includes(next[unlinked].position)) continue;
        next[unlinked] = { ...next[unlinked], userId: u.id };
      } else next.push({ id: randomUUID(), position: STAFF_POSITION, userId: u.id, name: `${u.name} ${u.surname}`.trim(), email: u.email, phone: "", profilePic: "", tagIds: [], staffOnly: true });
      changed = true;
    }
    return changed ? next : NO_CHANGE;
  });
  return { added: created.length, updated: updated.length };
}
