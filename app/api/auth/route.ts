import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail, verifyPassword } from "@/lib/userData";
import { getRoleById } from "@/lib/rolesData";
import { SessionPayload } from "@/lib/roles";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password", debug: "user_not_found", emailUsed: email },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(user, password);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid email or password", debug: "password_mismatch", hasHash: !!user.password, hashStart: user.password?.substring(0, 7) },
        { status: 401 }
      );
    }

    const role = await getRoleById(user.role);
    const session: SessionPayload = {
      id: user.id,
      name: user.name,
      surname: user.surname,
      email: user.email,
      role: user.role,
      roleName: role?.name || user.role,
      permissions: role?.permissions || [],
    };

    return NextResponse.json({
      session,
      forcePasswordChange: user.forcePasswordChange,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Internal server error", debug: message },
      { status: 500 }
    );
  }
}
