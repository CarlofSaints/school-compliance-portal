import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail, verifyPassword } from "@/lib/userData";
import { getRoleById, resolveRolePermissions } from "@/lib/rolesData";
import { SessionPayload } from "@/lib/roles";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/session";
import { tenantScope } from "@/lib/tenantContext";

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
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(user, password);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
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
      permissions: resolveRolePermissions(user.role, role),
    };

    // The cookie IS the sign-in now. `session` in the body is only what the
    // pages draw (name, menu); the server never believes it.
    const { key: tenantKey } = await tenantScope();
    const res = NextResponse.json({
      session,
      forcePasswordChange: user.forcePasswordChange,
    });
    res.cookies.set(
      SESSION_COOKIE,
      createSessionToken(user, tenantKey),
      sessionCookieOptions(req.headers.get("x-forwarded-host") || req.headers.get("host"))
    );
    return res;
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Sign out. Clears the cookie; the page clears its own copy of the session.
// Answers 200 whether or not anybody was signed in, so a double click or an
// already-expired session never shows an error on the way out.
export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(req.headers.get("x-forwarded-host") || req.headers.get("host"), 0),
    maxAge: 0,
  });
  return res;
}
