import { NextRequest, NextResponse } from "next/server";
import { getUserById, updateUser, verifyPassword } from "@/lib/userData";
import { requireLogin } from "@/lib/rolesData";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions, isHttps } from "@/lib/session";
import { tenantScope } from "@/lib/tenantContext";

export async function POST(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  try {
    const { currentPassword, newPassword } = await req.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current and new passwords are required" },
        { status: 400 }
      );
    }
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const user = await getUserById(session.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const valid = await verifyPassword(user, currentPassword);
    if (!valid) {
      // 400, not 401: the page treats a 401 as "signed out" and drops the
      // session, so a mistyped current password used to log the person out.
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 }
      );
    }

    const updated = await updateUser(session.id, {
      password: newPassword,
      forcePasswordChange: false,
    });

    // A session is signed against the password hash, so the cookie this
    // request came in with just died, along with every other device signed in
    // as this person. Re-issue one for THIS browser so changing your own
    // password does not sign you out; the other devices stay signed out.
    const res = NextResponse.json({ success: true });
    if (updated) {
      const { key: tenantKey } = await tenantScope();
      res.cookies.set(
        SESSION_COOKIE,
        createSessionToken(updated, tenantKey),
        sessionCookieOptions(isHttps(req))
      );
    }
    return res;
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
