import { NextRequest, NextResponse } from "next/server";
import { requirePermission, roleWithinReach, roleExists, maySelfTag, sameIds } from "@/lib/rolesData";
import { isPlausibleEmail } from "@/lib/emailIdentity";

const outOfReach = () =>
  NextResponse.json(
    { error: "This user holds a role with more access than yours, so only someone with that access can change them." },
    { status: 403 }
  );
import { getUserById, updateUser, deleteUser, getUsers } from "@/lib/userData";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "manage_users");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const user = await getUserById(id);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const { password, ...safe } = user;
  return NextResponse.json(safe);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "manage_users");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  try {
    const body = await req.json();
    const existing = await getUserById(id);
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (!(await roleWithinReach(session, existing.role))) return outOfReach();

    // Only the fields the Users screen edits. The whole body used to be saved
    // as sent, so it could carry a role, an id or anything else.
    const updates: Parameters<typeof updateUser>[1] = {};
    if (typeof body.name === "string") updates.name = body.name.trim();
    if (typeof body.surname === "string") updates.surname = body.surname.trim();
    if (typeof body.email === "string") {
      const email = body.email.trim();
      if (!isPlausibleEmail(email.toLowerCase())) {
        return NextResponse.json({ error: "That is not a usable email address." }, { status: 400 });
      }
      // Same rule as creating a user: two accounts on one address means sign
      // in and password resets reach whichever is found first.
      if (email.toLowerCase() !== existing.email.toLowerCase()) {
        const users = await getUsers();
        if (users.some((u) => u.id !== id && u.email.toLowerCase() === email.toLowerCase())) {
          return NextResponse.json({ error: "Another user already has that email address." }, { status: 409 });
        }
      }
      updates.email = email;
    }
    if (typeof body.forcePasswordChange === "boolean") updates.forcePasswordChange = body.forcePasswordChange;
    if (Array.isArray(body.tagIds)) {
      const tagIds = body.tagIds.filter((t: unknown): t is string => typeof t === "string");
      if (!sameIds(tagIds, existing.tagIds)) {
        if (id === session.id && !maySelfTag(session)) {
          return NextResponse.json(
            { error: "You cannot change the tags on your own account. Ask a Super Admin." },
            { status: 403 }
          );
        }
        updates.tagIds = tagIds;
      }
    }
    if (typeof body.password === "string" && body.password) updates.password = body.password;
    if (typeof body.role === "string" && body.role !== existing.role) {
      if (!(await roleExists(body.role))) {
        return NextResponse.json({ error: "That role does not exist." }, { status: 400 });
      }
      if (!(await roleWithinReach(session, body.role))) {
        return NextResponse.json(
          { error: "You can only give a role whose access you hold yourself." },
          { status: 403 }
        );
      }
      updates.role = body.role;
    }

    const updated = await updateUser(id, updates);
    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const { password, ...safe } = updated;
    return NextResponse.json(safe);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "manage_users");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  if (id === session.id) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }
  const target = await getUserById(id);
  if (target && !(await roleWithinReach(session, target.role))) return outOfReach();
  const deleted = await deleteUser(id);
  if (!deleted) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
