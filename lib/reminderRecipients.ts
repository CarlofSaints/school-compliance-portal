import { getUsers } from "./userData";
import { getRoles, resolveRolePermissions } from "./rolesData";
import { getCustodian } from "./spendData";
import type { SpendApplication } from "./spendData";
import type { ReminderRecipient } from "./reminderData";

export interface ResolvedRecipient {
  email: string;
  name: string;
  role: string;
}

// Turns a reminder's recipient roles into actual addresses, at send time.
// Resolving late means a reminder scheduled last month still reaches whoever
// is the custodian today.
export async function resolveRecipients(
  app: SpendApplication,
  recipients: ReminderRecipient[]
): Promise<{ resolved: ResolvedRecipient[]; missing: string[] }> {
  const users = await getUsers();
  const byId = new Map(users.map((u) => [u.id, u]));
  const out: ResolvedRecipient[] = [];
  const missing: string[] = [];

  const push = (
    email: string | undefined,
    name: string,
    role: string
  ): void => {
    if (!email) {
      missing.push(role);
      return;
    }
    out.push({ email, name: name || email, role });
  };

  for (const recipient of recipients) {
    if (recipient === "submitter") {
      const u = byId.get(app.submittedBy);
      push(u?.email, u ? `${u.name} ${u.surname}` : app.submittedByName, "Submitter");
    } else if (recipient === "applicant") {
      const u = app.applicantUserId ? byId.get(app.applicantUserId) : undefined;
      push(
        u?.email || app.applicantEmail,
        u
          ? `${u.name} ${u.surname}`
          : `${app.applicantName} ${app.applicantSurname}`.trim(),
        "Applicant"
      );
    } else if (recipient === "custodian") {
      const custodian = getCustodian(app);
      const u = custodian.userId ? byId.get(custodian.userId) : undefined;
      push(u?.email, u ? `${u.name} ${u.surname}` : custodian.name, "Custodian");
    } else if (recipient === "admin") {
      // Anyone whose role can manage spend settings. Uses the same resolution
      // as a session, so a Super Admin counts even if its stored role record
      // predates a permission key.
      const roles = await getRoles();
      const admins = users.filter((u) =>
        resolveRolePermissions(
          u.role,
          roles.find((r) => r.id === u.role)
        ).includes("manage_spend_settings")
      );
      if (admins.length === 0) missing.push("Admins");
      for (const a of admins) {
        push(a.email, `${a.name} ${a.surname}`, "Admin");
      }
    }
  }

  // One address may match several roles (the submitter is often the applicant
  // too); send once, keeping the first role that claimed them.
  const seen = new Set<string>();
  const deduped = out.filter((r) => {
    const key = r.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { resolved: deduped, missing };
}
