import { getPeople } from "./peopleData";
import { getUsers } from "./userData";
import { getRoles, resolveRolePermissions } from "./rolesData";
import type { ActionItem, ActionRecipient } from "./actionItemData";

export interface ResolvedActionRecipient {
  email: string;
  name: string;
  // Why this person is being written to, shown in the email so nobody wonders.
  role: string;
}

// Who counts as an action-item administrator.
//
// Same ANY-of list the API gates on. manage_people rides alongside the new key
// because a role record stored before manage_action_items existed will never
// gain it, and gating on the new key alone would mean the reminders had no
// admins to write to on day one.
export const ACTION_ADMIN_PERMISSIONS = [
  "manage_action_items",
  "manage_people",
];

// Turns an action's recipient roles into actual addresses, at send time.
//
// A person in the governance register may or may not have a portal login. A
// linked user is the source of truth for their own address - the same rule the
// People directory uses - so a member who changes their email in their account
// keeps receiving the chases.
export async function resolveActionRecipients(
  item: ActionItem,
  recipients: ActionRecipient[]
): Promise<{ resolved: ResolvedActionRecipient[]; missing: string[] }> {
  const [people, users, roles] = await Promise.all([
    getPeople(),
    getUsers(),
    getRoles(),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const personById = new Map(people.map((p) => [p.id, p]));

  const out: ResolvedActionRecipient[] = [];
  const missing: string[] = [];

  const push = (email: string | undefined, name: string, role: string) => {
    if (!email) {
      missing.push(name || role);
      return;
    }
    out.push({ email, name: name || email, role });
  };

  for (const recipient of recipients) {
    if (recipient === "assignees") {
      if (item.assigneeIds.length === 0) missing.push("nobody is assigned");
      item.assigneeIds.forEach((personId, i) => {
        const person = personById.get(personId);
        const linked = person?.userId ? userById.get(person.userId) : undefined;
        const name = linked
          ? `${linked.name} ${linked.surname}`.trim()
          : person?.name || item.assigneeNames[i] || "Assignee";
        push(linked?.email || person?.email, name, "Assigned to you");
      });
    } else if (recipient === "raiser") {
      const u = userById.get(item.raisedById);
      push(
        u?.email,
        u ? `${u.name} ${u.surname}` : item.raisedByName,
        "You raised this action"
      );
    } else if (recipient === "admins") {
      const admins = users.filter((u) =>
        resolveRolePermissions(
          u.role,
          roles.find((r) => r.id === u.role)
        ).some((p) => ACTION_ADMIN_PERMISSIONS.includes(p))
      );
      if (admins.length === 0) missing.push("no administrators found");
      for (const a of admins) {
        push(a.email, `${a.name} ${a.surname}`, "Action items administrator");
      }
    }
  }

  // One address can match several roles - the person who raised an action is
  // often assigned it too. Write once, keeping the first role that claimed them.
  const seen = new Set<string>();
  const deduped = out.filter((r) => {
    const key = r.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { resolved: deduped, missing };
}

// The register's own view of a person's name, used when an item is written or
// displayed. Falls back to whatever was stored on the item.
export function displayNameFor(
  personId: string,
  people: { id: string; name: string; userId: string | null }[],
  users: { id: string; name: string; surname: string }[],
  fallback = ""
): string {
  const person = people.find((p) => p.id === personId);
  if (!person) return fallback;
  const linked = person.userId
    ? users.find((u) => u.id === person.userId)
    : undefined;
  return linked ? `${linked.name} ${linked.surname}`.trim() : person.name || fallback;
}

// The register entries a login belongs to.
//
// A person can hold more than one position (Treasurer and Co-opted, say), which
// is a separate register entry each time, so this is a list. An action assigned
// to any of them is that user's action.
export async function personIdsForUser(userId: string): Promise<string[]> {
  const people = await getPeople();
  return people.filter((p) => p.userId === userId).map((p) => p.id);
}

// Whether this session may update the progress on an action without holding
// manage_action_items: they have to be one of the people carrying it.
export async function isAssignee(
  item: ActionItem,
  userId: string
): Promise<boolean> {
  const mine = await personIdsForUser(userId);
  return item.assigneeIds.some((id) => mine.includes(id));
}
