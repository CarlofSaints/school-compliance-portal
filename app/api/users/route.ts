import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { getUsers, createUser } from "@/lib/userData";
import { sendWelcomeEmail } from "@/lib/email";
import { v4 as uuidv4 } from "uuid";

export async function GET(req: NextRequest) {
  const session = await requirePermission(req, "manage_users");
  if (session instanceof NextResponse) return session;

  const users = await getUsers();
  const safe = users.map(({ password, ...u }) => u);
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

    if (sendEmail) {
      await sendWelcomeEmail(email, name, password);
    }

    const { password: _, ...safe } = user;
    return NextResponse.json(safe, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
