import { NextRequest, NextResponse } from "next/server";
import { LIMITS, peek, hit, clear, tooMany, ipOf, type Limit } from "@/lib/rateLimit";
import { getUserByEmail, getUserById, verifyPassword, type User } from "@/lib/userData";
import { getRoleById, resolveRolePermissions } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { afterResponse, actorFromUser } from "@/lib/activityActor";
import { UNKNOWN_ADDRESS, UNKNOWN_CONNECTION } from "@/lib/activityLabels";
import { countSignIn, deviceOf, maskTypedEmail, sastIso } from "@/lib/signinLog";
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

    // Every attempt goes in the activity log (never the password), through
    // afterResponse: written once the reply has gone, so logging cannot make
    // an address with an account answer slower than one without.
    // Logged as the address the limiter counted, so an investigator sees
    // the one that was actually counted or locked.
    const ip = ipOf(req);
    const device = deviceOf(req.headers.get("user-agent"));
    // What was typed, for detail only, and MASKED (people type their
    // password here). Never the actor or summary: it is a stranger's input
    // and would forge the "Who" column.
    const typed = maskTypedEmail(email);
    const actorOf = (u: User) => ({ ...actorFromUser(req, u), ip });

    // Rate limits: every attempt counts against the connection; WRONG
    // passwords count against the address, whether or not it has an account,
    // so the lock cannot be used to find out which addresses exist.
    const ipHit = await hit(LIMITS.loginIp, ip);
    if (!ipHit.ok) {
      // Only the FIRST refusal in a window is logged, so a bot hammering the
      // form cannot flood the log.
      if (ipHit.count === LIMITS.loginIp.max + 1) {
        await afterResponse(() =>
          recordActivity({
            actorName: UNKNOWN_CONNECTION,
            ip,
            action: "auth.sign_in_blocked",
            entity: "auth",
            summary: "Sign-in refused: too many attempts from this connection",
            detail: { reason: "too_many_from_ip", typedEmail: typed, device },
          })
        );
      }
      return tooMany(LIMITS.loginIp, ipHit);
    }
    const account = String(email).trim().toLowerCase();
    const locked = await peek(LIMITS.loginAccount, account);
    if (!locked.ok) return tooMany(LIMITS.loginAccount, locked);

    const user = await getUserByEmail(email);
    if (!user) {
      await hit(LIMITS.loginAccount, account);
      await afterResponse(async () => {
        // Read first: only the first attempt in a window writes the marker.
        if (!(await peek(UNKNOWN_ADDRESS_LOG, ip)).ok) return;
        const marker = await hit(UNKNOWN_ADDRESS_LOG, ip);
        if (marker.count !== 1) return;
        await recordActivity({
          actorName: UNKNOWN_ADDRESS,
          ip,
          action: "auth.sign_in_failed",
          entity: "auth",
          summary: `Failed sign-in for an unknown address (further ones from this connection in the next ${UNKNOWN_ADDRESS_LOG.windowSec / 60} minutes are not logged)`,
          detail: { reason: "unknown_email", firstTypedEmail: typed, attemptsFromConnection: ipHit.count, device },
        });
      });
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(user, password);
    if (!valid) {
      const accountHit = await hit(LIMITS.loginAccount, account);
      // When the lock lifts, from the limiter's own answer, taken NOW (not
      // when the log write runs) so summary and detail say the same thing.
      const lockedUntil = Date.now() + accountHit.retryAfter * 1000;
      await afterResponse(async () => {
        await Promise.all([
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
          const until = sastIso(lockedUntil).slice(11, 16);
          await recordActivity({
            ...actorOf(user),
            action: "auth.sign_in_blocked",
            entity: "auth",
            entityId: user.id,
            summary: `Account locked until ${until} SAST after ${LIMITS.loginAccount.max} wrong passwords`,
            detail: { reason: "account_locked", lockedUntil: new Date(lockedUntil).toISOString(), device },
          });
        }
      });
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
    // Queued only now the reply with the cookie exists: a sign-in that failed
    // to build one must not be logged as signed in.
    await afterResponse(() =>
      Promise.all([
        recordActivity({
          ...actorOf(user),
          action: "auth.sign_in",
          entity: "auth",
          entityId: user.id,
          summary: "Signed in",
          detail: { device },
        }),
        countSignIn(user, "ok", ip, device),
      ])
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
  // Who is leaving, if anybody, worked out AFTER the reply: one lookup and one
  // signature check, no retries. A failure only means the sign-out goes
  // unlogged, never that it is slowed down or refused.
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const device = deviceOf(req.headers.get("user-agent"));
  // afterResponse never throws and logs its own failures.
  await afterResponse(async () => {
    const claims = readSessionClaims(token);
    const user = claims ? await getUserById(claims.u) : undefined;
    const { key: tenantKey } = await tenantScope();
    if (!token || !user || !verifySessionToken(token, user, tenantKey)) return;
    await recordActivity({
      ...actorFromUser(req, user),
      ip: ipOf(req),
      action: "auth.sign_out",
      entity: "auth",
      entityId: user.id,
      summary: "Signed out",
      detail: { device },
    });
  });
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(isHttps(req), 0),
    maxAge: 0,
  });
  return res;
}
