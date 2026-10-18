import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { getUsers } from "@/lib/userData";
import { displayName } from "@/lib/roomBookingData";

// Who a room can be booked FOR: portal logins only, because that person becomes
// a holder (gets the emails, may answer a request).
//
// 🔴 Id and name only. Email addresses go only to people who may already see
// the user list (view_users / manage_users); booking a room is not a licence
// to collect everyone's address. Same rule as the calendar's bookingView.
export async function GET(req: NextRequest) {
  const session = await requireAnyPermission(req, ["book_rooms", "manage_rooms"]);
  if (session instanceof NextResponse) return session;
  const withEmail = session.permissions.includes("view_users") || session.permissions.includes("manage_users");
  const users = await getUsers();
  return NextResponse.json(
    users
      .map((u) => ({ id: u.id, name: displayName(u), ...(withEmail ? { email: u.email } : {}) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    { headers: { "Cache-Control": "no-store" } }
  );
}
