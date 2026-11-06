import { isPlausibleEmail } from "./emailIdentity";
import { tk } from "./i18n/translate";
import { SUPER_ADMIN_ROLE_ID } from "./roles";

// Teachers and coaches are ordinary users with these details on the account,
// so deleting the user deletes them too. Client-safe. SACE and PERSAL numbers
// are for manage_users only: GET /api/users strips this field.

export type StaffType = "sgb" | "state" | "coach";

export interface StaffDetails {
  staffNumber: string;
  type: StaffType;
  sace: string;
  persal: string;
  subject: string;
  grade: string;
  /** When the login link was emailed, so a second press does not mail them again. */
  invitedAt?: string;
}

/** One row as typed, from the form or the file. */
export interface StaffRow {
  staffNumber: string;
  email: string;
  name: string;
  surname: string;
  role: string;
  type: string;
  sace: string;
  persal: string;
  subject: string;
  grade: string;
}

export const TYPE_LABELS: Record<StaffType, string> = { sgb: tk("SGB or Board Teacher"), state: tk("State Teacher"), coach: tk("Coach") };

/** Header text in the template, in Carl's order. A * marks a column the file must have. */
export const COLUMNS: { key: keyof StaffRow; header: string; aliases: string[]; width: number }[] = [
  { key: "staffNumber", header: "Staff number", aliases: ["staffno"], width: 14 },
  { key: "email", header: "Email address *", aliases: ["email"], width: 30 },
  { key: "name", header: "Name *", aliases: ["firstname"], width: 18 },
  { key: "surname", header: "Surname *", aliases: [], width: 18 },
  { key: "role", header: "Role *", aliases: [], width: 16 },
  { key: "type", header: "Staff type *", aliases: ["type", "sgborstate", "sgbteacherorstateteacher"], width: 22 },
  { key: "sace", header: "SACE number", aliases: ["sace"], width: 15 },
  { key: "persal", header: "Persal number", aliases: ["persal"], width: 15 },
  { key: "subject", header: "Subject", aliases: ["subjects"], width: 28 },
  { key: "grade", header: "Grade", aliases: ["grades"], width: 16 },
];

const squash = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const text = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

export function parseType(v: string): StaffType | null {
  const s = squash(v);
  // Only a coach who does not teach. "State Teacher and Coach" is a teacher, with a SACE number.
  if (s.includes("coach") && !s.includes("teach")) return "coach";
  if (s.includes("state")) return "state";
  return s.includes("sgb") || s.includes("board") ? "sgb" : null;
}

/** Tidies whatever arrived, so nothing past here sees a non-string. */
export function cleanRow(b: Partial<Record<keyof StaffRow, unknown>>): StaffRow {
  const row = {} as StaffRow;
  for (const c of COLUMNS) row[c.key] = text(b[c.key]);
  row.email = row.email.toLowerCase();
  return row;
}

/** A grid (grid[0] is Excel row 1) into rows. The header may sit anywhere and columns in any order. */
export function rowsFromGrid(grid: unknown[][]): { rows: (StaffRow & { row: number })[]; missing: string[] } {
  const matches = (c: (typeof COLUMNS)[number], cell: unknown) => [squash(c.header), ...c.aliases].includes(squash(cell));
  const email = COLUMNS.find((c) => c.key === "email")!;
  const headerAt = grid.findIndex((r) => r.some((cell) => matches(email, cell)));
  const header = headerAt < 0 ? [] : grid[headerAt];
  const at = COLUMNS.map((c) => ({ c, i: header.findIndex((cell) => matches(c, cell)) }));
  const missing = at.filter(({ c, i }) => i < 0 && c.header.endsWith("*")).map(({ c }) => c.header.replace(" *", ""));
  if (missing.length) return { rows: [], missing };
  const rows = grid.slice(headerAt + 1).flatMap((cells, n) => {
    if (cells.every((cell) => !String(cell ?? "").trim())) return [];
    const b: Partial<Record<keyof StaffRow, unknown>> = {};
    for (const { c, i } of at) if (i >= 0) b[c.key] = cells[i];
    return [{ ...cleanRow(b), row: headerAt + n + 2 }];
  });
  return { rows, missing };
}

export interface RowResult {
  row: number;
  name: string;
  firstName: string;
  surname: string;
  email: string;
  /** add = a new user. update = already a user: only the staff details change. */
  action: "add" | "update";
  problems: string[];
  roleMissing: boolean;
  roleId: string;
  roleName: string;
  userId?: string;
  details: StaffDetails | null;
}

interface Ctx {
  roles: { id: string; name: string }[];
  users: { id: string; email: string; role: string; name: string; surname: string }[];
  /** May this admin give, or change someone on, this role? */
  within: (roleId: string) => boolean;
}

/** Every rule for a row, for the form and the file alike. */
export function checkRows(rows: (StaffRow & { row: number })[], ctx: Ctx): RowResult[] {
  const seen = new Set<string>();
  return rows.map((r) => {
    const problems: string[] = [];
    const email = r.email.trim().toLowerCase();
    const existing = ctx.users.find((u) => u.email.trim().toLowerCase() === email);
    const wanted = r.role.trim().toLowerCase();
    const role = existing ? ctx.roles.find((x) => x.id === existing.role) : ctx.roles.find((x) => x.name.trim().toLowerCase() === wanted);
    let roleMissing = false;

    if (!email) problems.push("Email address is missing.");
    else if (!isPlausibleEmail(email)) problems.push(`"${r.email}" is not a usable email address.`);
    else if (seen.has(email)) problems.push(`${r.email} is in this list twice.`);
    seen.add(email);

    if (existing) {
      if (!ctx.within(existing.role)) problems.push("This person already has an account with more access than yours.");
      // A mistyped address must not put one person's numbers on someone else's account.
      const typed = `${r.name} ${r.surname}`.trim().toLowerCase();
      const account = `${existing.name} ${existing.surname}`.trim();
      if (typed && typed !== account.toLowerCase()) problems.push(`${r.email} belongs to ${account} on the portal, not ${r.name} ${r.surname}.`);
    } else {
      if (!r.name) problems.push("Name is missing.");
      if (!r.surname) problems.push("Surname is missing.");
      if (!wanted) problems.push("Role is missing.");
      else if (!role) {
        roleMissing = true;
        problems.push(`The role "${r.role}" does not exist. Add it on the Roles page first.`);
      } else if (role.id === SUPER_ADMIN_ROLE_ID) problems.push("Super Admin can only be given on the Users page.");
      else if (!ctx.within(role.id)) problems.push("You can only give a role whose access you hold yourself.");
    }

    const type = parseType(r.type);
    if (!type) problems.push(r.type ? `"${r.type}" is not one of the staff types.` : "Staff type is missing.");
    if (!r.sace && (type === "sgb" || type === "state")) problems.push("SACE number is needed for a teacher.");
    if (type === "state" && !r.persal) problems.push("Persal number is needed for a State teacher.");
    else if (r.persal && !/^\d{5,12}$/.test(r.persal)) problems.push("The Persal number must be 5 to 12 digits.");

    return {
      row: r.row,
      name: `${r.name} ${r.surname}`.trim() || r.email,
      firstName: r.name,
      surname: r.surname,
      email,
      action: existing ? "update" : "add",
      problems,
      roleMissing,
      roleId: role?.id ?? "",
      roleName: role?.name ?? "",
      userId: existing?.id,
      details: problems.length || !type ? null : { staffNumber: r.staffNumber, type, sace: r.sace, persal: r.persal, subject: r.subject, grade: r.grade },
    };
  });
}
