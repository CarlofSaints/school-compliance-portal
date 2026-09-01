import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getPeople, photoUrlFor } from "@/lib/peopleData";
import { getUsers } from "@/lib/userData";

// The register as everyone else sees it: who holds which position, how to reach
// them, and their photo.
//
// Deliberately separate from GET /api/people, which is the admin endpoint and
// returns the full record behind manage_people. This one is login-only, because
// it feeds two things that are not administration:
//
//   - the approver picker on Approval Settings, where naming the Principal as
//     the approver for a band should not also demand the right to edit the
//     register;
//   - the People directory, which is for everybody in the portal.
//
// It carries no more than a printed governing-body contact list would.
//
// Only positions with somebody in them are returned: an empty position has
// nobody to approve and nobody to show, so offering it would be a trap on one
// page and a blank card on the other.
export async function GET(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const [people, users] = await Promise.all([getPeople(), getUsers()]);

  const directory = people
    .filter((p) => p.name || p.userId)
    .map((p) => {
      const linked = p.userId ? users.find((u) => u.id === p.userId) : undefined;
      return {
        id: p.id,
        position: p.position,
        // A linked user is the source of truth for their own name and email, so
        // the directory does not go stale when somebody updates their account.
        name: linked ? `${linked.name} ${linked.surname}`.trim() : p.name,
        email: linked?.email || p.email,
        phone: p.phone,
        photoUrl: photoUrlFor(p),
        tagIds: p.tagIds || [],
        // Only somebody with a login can click Approve. The approver picker
        // shows this so a band is not quietly set to a person who can never
        // action it.
        hasLogin: !!linked,
      };
    })
    .sort((a, b) => a.position.localeCompare(b.position));

  return NextResponse.json(directory, {
    headers: { "Cache-Control": "no-store" },
  });
}
