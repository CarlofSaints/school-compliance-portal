import { NextRequest, NextResponse } from "next/server";
import { LIMITS, enforce, peek, hit, clear, tooMany, ipOf } from "@/lib/rateLimit";
import { getUserByEmail, verifyPassword } from "@/lib/userData";
import { getRoleById, resolveRolePermissions } from "@/lib/rolesData";
import { SessionPayload } from "@/lib/roles";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  isHttps,
  isSameOriginWrite,
} from "@/lib/session";

// Sign-in and sign-out are the two writes that run with no session, so they
// get the cross-site check here rather than from getSessionFromRequest.
// Without it another site could post a form that signs a visitor into the
// attacker's account.
function fromThisSite(req: NextRequest): boolean {
  return isSameOriginWrite(
    req.method,
    req.headers.get("origin"),
    req.headers.get("x-forwarded-host") || req.headers.get("host")
  );
}
import { tenantScope } from "@/lib/tenantContext";

export async function POST(req: NextRequest) {
  if (!fromThisSite(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Rate limits: every attempt counts against the connection; WRONG
    // passwords count against the address, whether or not it has an account,
    // so the lock cannot be used to find out which addresses exist.
    const limited = await enforce([[LIMITS.loginIp, ipOf(req)]]);
    if (limited) return limited;
    const account = String(email).trim().toLowerCase();
    const locked = await peek(LIMITS.loginAccount, account);
    if (!locked.ok) return tooMany(LIMITS.loginAccount, locked);

    const user = await getUserByEmail(email);
    if (!user) {
      await hit(LIMITS.loginAccount, account);
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(user, password);
    if (!valid) {
      await hit(LIMITS.loginAccount, account);
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }
    // The right password wipes the wrong-password count.
    await clear(LIMITS.loginAccount, account);

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
      sessionCookieOptions(isHttps(req))
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
  if (!fromThisSite(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(isHttps(req), 0),
    maxAge: 0,
  });
  return res;
}
