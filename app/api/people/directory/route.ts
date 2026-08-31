import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { getPeople } from "@/lib/peopleData";
import { getUsers } from "@/lib/userData";

// A minimal register directory for the approver picker on Approval Settings.
//
// Deliberately separate from GET /api/people, which is an admin endpoint
// returning the full record and requires manage_people: naming the Principal
// as the approver for a band is an approval-settings job, and should not also
// demand the right to edit the register.
//
// Only positions with somebody in them are returned — an empty position has
// nobody to approve, so offering it as a tick box would be a trap.
export async function GET(req: NextRequest) {
  const session = await requirePermission(req, "manage_approval_settings");
  if (session instanceof NextResponse) return session;

  const [people, users] = await Promise.all([getPeople(), getUsers()]);

  const directory = people
    .filter((p) => p.name || p.userId)
    .map((p) => {
      const linked = p.userId ? users.find((u) => u.id === p.userId) : undefined;
      return {
        id: p.id,
        position: p.position,
        name: linked ? `${linked.name} ${linked.surname}`.trim() : p.name,
        email: linked?.email || p.email,
        // Only somebody with a login can click Approve. The picker shows this
        // so a band is not quietly set to a person who can never action it.
        hasLogin: !!linked,
      };
    })
    .sort((a, b) => a.position.localeCompare(b.position));

  return NextResponse.json(directory);
}
