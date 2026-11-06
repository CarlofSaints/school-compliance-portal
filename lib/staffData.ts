import { randomBytes, randomUUID } from "node:crypto";
import { NO_CHANGE } from "./controlData";
import { changePeople } from "./peopleData";
import type { RowResult, StaffDetails } from "./staff";
import { createUsers, updateUsersWhere } from "./userData";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Loads checked rows, each with no problems: new users, details on existing ones, and one register entry each. */
export async function loadStaff(good: RowResult[]): Promise<{ added: number; updated: number }> {
  const adds = good.filter((r) => r.action === "add");
  const updates = good.filter((r) => r.action === "update");
  const details = new Map(updates.map((r) => [r.userId!, r.details as StaffDetails]));

  const created = await createUsers(
    adds.map((r) => ({
      id: randomUUID(),
      name: r.firstName,
      surname: r.surname,
      email: r.email,
      // They choose their own through the emailed link or Forgot your password?.
      password: randomBytes(24).toString("hex"),
      role: r.roleId,
      forcePasswordChange: true,
      tagIds: [],
      // Staff are not governors: the lock when an SGB term ends must not catch them.
      keepsAccessAfterTerm: true,
      staff: r.details as StaffDetails,
    }))
  );
  const updated = details.size ? await updateUsersWhere((u) => (details.has(u.id) ? { staff: { ...details.get(u.id)!, invitedAt: u.staff?.invitedAt } } : null)) : [];

  const onRegister = [
    ...created.map((u) => ({ userId: u.id, name: `${u.name} ${u.surname}`.trim(), email: u.email, position: adds.find((r) => same(r.email, u.email))!.roleName })),
    ...updates.filter((r) => updated.includes(r.userId!)).map((r) => ({ userId: r.userId!, name: r.name, email: r.email, position: r.roleName || "Staff" })),
  ];
  await changePeople((people) => {
    const next = [...people];
    let changed = false;
    for (const p of onRegister) {
      if (next.some((x) => x.userId === p.userId)) continue;
      const unlinked = next.findIndex((x) => !x.userId && x.email && same(x.email, p.email));
      changed = true;
      if (unlinked >= 0) next[unlinked] = { ...next[unlinked], userId: p.userId };
      else next.push({ ...p, id: randomUUID(), phone: "", profilePic: "", tagIds: [], staffOnly: true });
    }
    return changed ? next : NO_CHANGE;
  });
  return { added: created.length, updated: updated.length };
}
