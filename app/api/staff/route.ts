import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { getRoles, requirePermission, resolveRolePermissions } from "@/lib/rolesData";
import { SUPER_ADMIN_ROLE_ID, type Role } from "@/lib/roles";
import { checkRows, cleanRow, type StaffRow } from "@/lib/staff";
import { loadStaff } from "@/lib/staffData";
import { getUsers } from "@/lib/userData";

export const maxDuration = 120;
const MAX_ROWS = 2000;

const reach = (roles: Role[], session: { permissions: string[] }) => (id: string) =>
  resolveRolePermissions(id, roles.find((r) => r.id === id)).every((p) => session.permissions.includes(p));

export async function GET(req: NextRequest) {
  const session = await requirePermission(req, "manage_users");
  if (session instanceof NextResponse) return session;
  const [users, roles] = await Promise.all([getUsers(), getRoles()]);
  const within = reach(roles, session);
  const staff = users
    .filter((u) => u.staff)
    .map((u) => ({
      id: u.id,
      name: u.name,
      surname: u.surname,
      email: u.email,
      role: u.role,
      roleName: roles.find((r) => r.id === u.role)?.name || u.role,
      staff: u.staff,
      waiting: !!u.forcePasswordChange && !u.staff?.invitedAt,
    }))
    .sort((a, b) => `${a.surname} ${a.name}`.localeCompare(`${b.surname} ${b.name}`));
  return NextResponse.json(
    { staff, roles: roles.filter((r) => r.id !== SUPER_ADMIN_ROLE_ID && within(r.id)).map(({ id, name }) => ({ id, name })) },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// One route for the form and the file. check = report only, nothing saved.
export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_users");
  if (session instanceof NextResponse) return session;
  const b = (await req.json().catch(() => null)) as { rows?: unknown; check?: unknown; ignoreInvalid?: unknown } | null;
  if (!Array.isArray(b?.rows) || !b.rows.length) return NextResponse.json({ error: "There is nobody in that list." }, { status: 400 });
  if (b.rows.length > MAX_ROWS) return NextResponse.json({ error: `A file can hold ${MAX_ROWS} people at most.` }, { status: 400 });

  const rows = (b.rows as (Partial<StaffRow> & { row?: unknown })[]).map((r, i) => ({ ...cleanRow(r ?? {}), row: typeof r?.row === "number" ? r.row : i + 1 }));
  const [users, roles] = await Promise.all([getUsers(), getRoles()]);
  const results = checkRows(rows, { roles, users, within: reach(roles, session) });
  const report = results.map(({ row, name, email, action, problems, roleMissing }) => ({ row, name, email, action, problems, roleMissing }));
  const skipped = report.filter((r) => r.problems.length);

  if (b.check === true) return NextResponse.json({ results: report });
  if (skipped.length && b.ignoreInvalid !== true) return NextResponse.json({ error: "Fix the items listed first, or tick Ignore invalid items.", results: report }, { status: 409 });

  const { added, updated } = await loadStaff(results.filter((r) => !r.problems.length));
  await recordActivity({ ...actorFrom(req, session), action: "staff.loaded", entity: "user", entityId: "staff", summary: `Loaded staff: ${added} added, ${updated} updated, ${skipped.length} skipped` });
  return NextResponse.json({ added, updated, skipped });
}
