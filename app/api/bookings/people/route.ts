import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { getUsers } from "@/lib/userData";

// Who a room can be booked FOR: portal logins only, because that person becomes
// a holder (gets the emails, may answer a request). Name and email only, the
// email so two people with the same name can be told apart.
export async function GET(req: NextRequest) {
  const session = await requireAnyPermission(req, ["book_rooms", "manage_rooms"]);
  if (session instanceof NextResponse) return session;
  const users = await getUsers();
  return NextResponse.json(
    users
      .map((u) => ({ id: u.id, name: `${u.name} ${u.surname}`.trim() || u.email, email: u.email }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    { headers: { "Cache-Control": "no-store" } }
  );
}
