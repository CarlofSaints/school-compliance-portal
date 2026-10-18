import { NextRequest, NextResponse } from "next/server";
import { getRoles, requireAnyPermission, resolveRolePermissions } from "@/lib/rolesData";
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
  // Only people who can be booked for: they become a holder, so they must be
  // able to book, or manage rooms (the same rule the booking itself checks).
  const roles = await getRoles();
  const users = (await getUsers()).filter((u) => {
    const perms = resolveRolePermissions(u.role, roles.find((r) => r.id === u.role));
    return perms.includes("book_rooms") || perms.includes("manage_rooms");
  });
  return NextResponse.json(
    users
      .map((u) => ({ id: u.id, name: displayName(u), ...(withEmail ? { email: u.email } : {}) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    { headers: { "Cache-Control": "no-store" } }
  );
}
