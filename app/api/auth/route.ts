import { NextRequest, NextResponse } from "next/server";
import { LIMITS, peek, hit, clear, tooMany, ipOf, type Limit } from "@/lib/rateLimit";
import { getUserByEmail, getUserById, verifyPassword, type User } from "@/lib/userData";
import { getRoleById, resolveRolePermissions } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { clientIp } from "@/lib/activityActor";
import { countSignIn, deviceOf } from "@/lib/signinLog";
import { SessionPayload } from "@/lib/roles";
import {
  SESSION_COOKIE,
  createSessionToken,
  readSessionClaims,
  verifySessionToken,
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

// Not a limit anybody is refused by: a once-per-window marker, so failed
// sign-ins for addresses with no account log ONE entry per connection per
// window, however many addresses a bot tries.
const UNKNOWN_ADDRESS_LOG: Limit = {
  scope: "login-unknown-ip",
  max: 1,
  windowSec: LIMITS.loginIp.windowSec,
  message: "",
};

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

    // Every attempt goes in the activity log (never the password). Awaited:
    // a write left running when the function returns is simply dropped.
    // The limiter counts by ipOf; the log records the same address every
    // other activity entry does.
    const limitKey = ipOf(req);
    const ip = clientIp(req);
    const device = deviceOf(req.headers.get("user-agent"));
    // What was typed, for an address with no account. Capped: it is input.
    const typed = String(email).trim().slice(0, 120);
    const actorOf = (u: User) => ({
      actorId: u.id,
      actorName: `${u.name} ${u.surname}`.trim() || u.email,
      actorEmail: u.email,
      ip,
    });

    // Rate limits: every attempt counts against the connection; WRONG
    // passwords count against the address, whether or not it has an account,
    // so the lock cannot be used to find out which addresses exist.
    const ipHit = await hit(LIMITS.loginIp, limitKey);
    if (!ipHit.ok) {
      // Only the FIRST refusal in a window is logged, so a bot hammering the
      // form cannot flood the log.
      if (ipHit.count === LIMITS.loginIp.max + 1) {
        await recordActivity({
          actorName: typed || "Unknown",
          ip,
          action: "auth.sign_in_blocked",
          entity: "auth",
          summary: "Sign-in refused: too many attempts from this connection",
          detail: { reason: "too_many_from_ip", typedEmail: typed, device },
        });
      }
      return tooMany(LIMITS.loginIp, ipHit);
    }
    const account = String(email).trim().toLowerCase();
    const locked = await peek(LIMITS.loginAccount, account);
    if (!locked.ok) return tooMany(LIMITS.loginAccount, locked);

    const user = await getUserByEmail(email);
    if (!user) {
      const [, marker] = await Promise.all([
        hit(LIMITS.loginAccount, account),
        hit(UNKNOWN_ADDRESS_LOG, limitKey),
      ]);
      if (marker.count === 1) {
        await recordActivity({
          actorName: typed,
          ip,
          action: "auth.sign_in_failed",
          entity: "auth",
          summary: `Failed sign-in for an unknown address from ${ip || "an unknown connection"} (further ones from this connection in the next ${UNKNOWN_ADDRESS_LOG.windowSec / 60} minutes are not logged)`,
          detail: { reason: "unknown_email", firstTypedEmail: typed, attemptsFromConnection: ipHit.count, device },
        });
      }
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(user, password);
    if (!valid) {
      const [accountHit] = await Promise.all([
        hit(LIMITS.loginAccount, account),
        recordActivity({
          ...actorOf(user),
          action: "auth.sign_in_failed",
          entity: "auth",
          entityId: user.id,
          summary: "Failed sign-in: wrong password",
          detail: { reason: "wrong_password", device },
        }),
        countSignIn(user, "failed", ip, device),
      ]);
      // The wrong password that locks the account, logged once per lock.
      if (accountHit.count === LIMITS.loginAccount.max) {
        await recordActivity({
          ...actorOf(user),
          action: "auth.sign_in_blocked",
          entity: "auth",
          entityId: user.id,
          summary: `Account locked for ${LIMITS.loginAccount.windowSec / 60} minutes after ${LIMITS.loginAccount.max} wrong passwords`,
          detail: { reason: "account_locked", device },
        });
      }
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
    await Promise.all([
      recordActivity({
        ...actorOf(user),
        action: "auth.sign_in",
        entity: "auth",
        entityId: user.id,
        summary: "Signed in",
        detail: { device },
      }),
      countSignIn(user, "ok", ip, device),
    ]);

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
  // Who is leaving, if anybody: one lookup and one signature check, no
  // retries. A failure only means the sign-out goes unlogged, never that it
  // is slowed down or refused.
  try {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const claims = readSessionClaims(token);
    const user = claims ? await getUserById(claims.u) : undefined;
    const { key: tenantKey } = await tenantScope();
    if (token && user && verifySessionToken(token, user, tenantKey)) {
      await recordActivity({
        actorId: user.id,
        actorName: `${user.name} ${user.surname}`.trim() || user.email,
        actorEmail: user.email,
        ip: clientIp(req),
        action: "auth.sign_out",
        entity: "auth",
        entityId: user.id,
        summary: "Signed out",
        detail: { device: deviceOf(req.headers.get("user-agent")) },
      });
    }
  } catch (err) {
    console.error("[auth] Could not log sign-out:", err);
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(isHttps(req), 0),
    maxAge: 0,
  });
  return res;
}
