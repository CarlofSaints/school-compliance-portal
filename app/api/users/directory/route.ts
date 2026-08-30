import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { getUsers } from "@/lib/userData";

// A minimal user directory for name pickers (the custodian / applicant
// dropdowns on spend). Deliberately separate from GET /api/users, which is an
// admin endpoint returning the full record - this returns only what a dropdown
// needs, so picking a colleague does not require manage_users.
export async function GET(req: NextRequest) {
  const session = await requirePermission(req, "submit_spend");
  if (session instanceof NextResponse) return session;

  const users = await getUsers();
  const directory = users
    .map((u) => ({
      id: u.id,
      name: u.name,
      surname: u.surname,
      email: u.email,
    }))
    .sort((a, b) =>
      `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`)
    );

  return NextResponse.json(directory);
}
