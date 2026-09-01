import { NextRequest, NextResponse } from "next/server";
import {
  requirePermission,
  requireAnyPermission,
  getRoles,
} from "@/lib/rolesData";
import { getUsers, createUser } from "@/lib/userData";
import { sendWelcomeEmail } from "@/lib/email";
import { v4 as uuidv4 } from "uuid";

// Readable with either permission: view_users opens the page read-only.
export async function GET(req: NextRequest) {
  const session = await requireAnyPermission(req, [
    "view_users",
    "manage_users",
  ]);
  if (session instanceof NextResponse) return session;

  const [users, roles] = await Promise.all([getUsers(), getRoles()]);
  // The role NAME is included so a read-only viewer, who cannot call
  // /api/roles, still sees "SGB Admin" rather than a raw role id.
  const safe = users.map(({ password, ...u }) => ({
    ...u,
    roleName: roles.find((r) => r.id === u.role)?.name || u.role,
  }));
  return NextResponse.json(safe);
}

export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_users");
  if (session instanceof NextResponse) return session;

  try {
    const body = await req.json();
    const { name, surname, email, password, role, forcePasswordChange, sendEmail, tagIds } = body;

    if (!name || !surname || !email || !password || !role) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    const users = await getUsers();
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return NextResponse.json(
        { error: "Email already exists" },
        { status: 409 }
      );
    }

    const user = await createUser({
      id: uuidv4(),
      name,
      surname,
      email,
      password,
      role,
      forcePasswordChange: forcePasswordChange ?? true,
      tagIds: Array.isArray(tagIds) ? tagIds : [],
    });

    // The account is already created and stored, so a mail failure must not
    // be reported as a failed create. It used to sit inside this try block, so
    // a Resend outage or a bounced address returned 500 "Internal server error"
    // for an account that existed perfectly well, and whoever was adding the
    // user would reasonably add them again.
    let emailed = false;
    let emailError: string | null = null;
    if (sendEmail) {
      try {
        await sendWelcomeEmail(email, name, password);
        emailed = true;
      } catch (err) {
        emailError =
          err instanceof Error ? err.message : "The welcome email did not send.";
        console.error("Welcome email failed for", email, err);
      }
    }

    const { password: _, ...safe } = user;
    return NextResponse.json(
      { ...safe, emailed, emailError },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
