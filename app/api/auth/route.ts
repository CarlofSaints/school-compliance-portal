import { NextRequest, NextResponse } from "next/server";
import { LIMITS, hit, clear, tooMany, ipOf, type Limit, type LimitResult } from "@/lib/rateLimit";
import { getUserByEmail, getUserById, verifyPassword, repairUserIndex, type User } from "@/lib/userData";
import { requireLogin } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { afterResponse, actorFromUser } from "@/lib/activityActor";
import { UNKNOWN_ADDRESS, UNKNOWN_CONNECTION } from "@/lib/activityLabels";
import { countSignIn, deviceOf, maskTypedEmail, sastIso } from "@/lib/signinLog";
import {
  SESSION_COOKIE,
  readSessionClaims,
  verifySessionToken,
  sessionCookieOptions,
  isHttps,
  isSameOriginWrite,
} from "@/lib/session";
import { finishSignIn } from "@/lib/signIn";
import { mfaRequired, getMfa, newSecret, otpauthUri, sealSecret, createPendingToken } from "@/lib/mfa";
import { resolveBranding } from "@/lib/brandingData";
import QRCode from "qrcode";

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

// Not a limit anybody is refused by: a once-per-window marker per ADDRESS
// that gates the inline scan for an account missing from the index.
const INDEX_REPAIR: Limit = {
  scope: "login-index-repair",
  max: 1,
  windowSec: LIMITS.loginIp.windowSec,
  message: "",
};

// Not a refusal either: how many of those scans one connection may cause per
// window (a school's few real misses fit easily; a bot's random list does not).
const INDEX_SCAN_IP: Limit = {
  scope: "login-index-scan-ip",
  max: 5,
  windowSec: LIMITS.loginIp.windowSec,
  message: "",
};

// Not a limit anybody is refused by: a once-per-window marker, so failed
// sign-ins for addresses with no account log ONE entry per connection per
// window, however many addresses a bot tries.
const UNKNOWN_ADDRESS_LOG: Limit = {
  scope: "login-unknown-ip",
  max: 1,
  windowSec: LIMITS.loginIp.windowSec,
  message: "",
};

// The signed-in person's permissions as the server works them out NOW. The
// browser keeps a copy from sign-in only to draw the menu; without this, a
// feature released (or a permission ticked) after someone signed in stayed
// hidden from them until they signed out and back in (Rooms, 18 Oct).
export async function GET(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  return NextResponse.json({
    id: session.id,
    permissions: session.permissions,
    role: session.role,
    roleName: session.roleName,
  });
}

export async function POST(req: NextRequest) {
  if (!fromThisSite(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { email, password } = await req.json();
    // The moment it happened, not the moment the deferred log write runs.
    const at = new Date().toISOString();
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // What is logged (never a password), all through afterResponse, written
    // once the reply has gone: every sign-in and every wrong password for a
    // real account; ONE entry per connection per window for unknown
    // addresses; ONE entry when a connection is blocked or an account locks.
    // Attempts on an already-locked account are counted but never logged:
    // the one "Account locked" entry covers them.
    // Logged as the address the limiter counted, so an investigator sees
    // the one that was actually counted or locked.
    const ip = ipOf(req);
    const device = deviceOf(req.headers.get("user-agent"));
    // What was typed, for detail only, and MASKED (people type their
    // password here). Never the actor or summary: it is a stranger's input
    // and would forge the "Who" column.
    const typed = maskTypedEmail(email);
    const actorOf = (u: User) => ({ ...actorFromUser(req, u), ip });

    // Rate limits: every attempt counts against the connection. Against the
    // address: every attempt on an indexed account (before the password check,
    // cleared by the right one), and every wrong or unknown answer otherwise,
    // whether or not it has an account, so the lock cannot be used to find out
    // which addresses exist.
    const ipHit = await hit(LIMITS.loginIp, ip);
    if (!ipHit.ok) {
      // Only the FIRST refusal in a window is logged, so a bot hammering the
      // form cannot flood the log.
      if (ipHit.count === LIMITS.loginIp.max + 1) {
        await afterResponse(() =>
          recordActivity({
            at,
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
    // Index first. The password is compared even with no account, so a
    // repeated unknown address answers in the same time as a wrong password.
    let user = await getUserByEmail(email, false);
    // Whether "no account" is CERTAIN. Not when the scan was skipped by the
    // per-connection cap: a real user missing from the index could be the one
    // typing, and the right password must never add to a lock.
    let certain = true;
    if (!user) {
      // Missing from the index (rare): the slow scan of every account's own
      // copy runs INLINE, so a real user dropped from the index still signs
      // in, and the index is put back after the reply. Once per address per
      // window (a counter that could not be saved allows it), so a truly
      // unknown address does not pay for the scan every time.
      // ...and at most INDEX_SCAN_IP.max scans per connection per window, so
      // random addresses cannot make one connection force thousands of reads.
      // (A later attempt this window, skipped by the per-address marker, is
      // certain: this window's scan found nobody, or put them back.)
      const scan = await hit(INDEX_REPAIR, account);
      if (scan.count === undefined || scan.count === 1) {
        if ((await hit(INDEX_SCAN_IP, ip)).ok) {
          user = await getUserByEmail(email);
          if (user) await afterResponse(() => repairUserIndex());
        } else {
          certain = false;
        }
      }
    }
    let accountHit: LimitResult | undefined;
    if (user || certain) {
      // Counted BEFORE the password is checked, in one guarded write, for a
      // real account and a certain unknown address alike: a LOCKED address is
      // refused at the same point either way (both 429s cost the same), and
      // the lock cannot tell addresses with an account apart. The right
      // password clears it below.
      accountHit = await hit(LIMITS.loginAccount, account);
      if (!accountHit.ok) return tooMany(LIMITS.loginAccount, accountHit);
    }
    const valid = await verifyPassword(user, password);
    if (!user) {
      await afterResponse(async () => {
        // Only the first unknown address from this connection in a window.
        const marker = await hit(UNKNOWN_ADDRESS_LOG, ip);
        if (marker.count !== 1) return;
        await recordActivity({
          at,
          actorName: UNKNOWN_ADDRESS,
          ip,
          action: "auth.sign_in_failed",
          entity: "auth",
          summary: `Failed sign-in for an unknown address (further ones from this connection in the next ${UNKNOWN_ADDRESS_LOG.windowSec / 60} minutes are not logged)`,
          detail: { reason: "unknown_email", firstTypedEmail: typed, allSignInAttemptsFromThisConnectionInWindow: ipHit.count, device },
        });
      });
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    if (!valid) {
      const wrongHit = accountHit!; // always counted just above for a wrong answer
      // When the lock lifts, from the limiter's own answer, taken NOW (not
      // when the log write runs) so summary and detail say the same thing.
      const lockedUntil = Date.now() + wrongHit.retryAfter * 1000;
      await afterResponse(async () => {
        await Promise.all([
          recordActivity({
            at,
            ...actorOf(user),
            action: "auth.sign_in_failed",
            entity: "auth",
            entityId: user.id,
            summary: "Failed sign-in: wrong password",
            detail: { reason: "wrong_password", device },
          }),
          countSignIn(user, "failed", ip, device, at),
        ]);
        // The wrong password that locks the account, logged once per lock.
        if (wrongHit.count === LIMITS.loginAccount.max) {
          const until = sastIso(lockedUntil).slice(11, 16);
          await recordActivity({
            at,
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

    // SGB terms: the right password, but the term has ended or they were
    // retired. Said plainly (they proved who they are), with what to do.
    const { applyTermLockIfDue } = await import("@/lib/governanceTermData");
    const termUser = (await applyTermLockIfDue({ force: true }).catch(() => false)) ? ((await getUserByEmail(email)) ?? user) : user;
    if (termUser.retiredAt || termUser.termLocked) {
      return NextResponse.json(
        {
          error: termUser.retiredAt
            ? "Your access to this portal has ended. If this is a mistake, ask the Principal."
            : "The governing body's term has ended. Ask the Principal to switch your access back on if you were re-elected.",
        },
        { status: 403 }
      );
    }

    // Super Admin: no cookie yet. The password earns a short-lived token that
    // only /api/auth/mfa accepts, with a code from their authenticator app.
    if (mfaRequired(user)) {
      const { key: tenantKey } = await tenantScope();
      if (await getMfa(user.id)) {
        return NextResponse.json({ mfa: "code", mfaToken: createPendingToken(user, tenantKey) });
      }
      // Not set up yet: the new secret rides in the token, sealed, and is
      // only saved once a code from it proves the app works.
      const secret = newSecret();
      const uri = otpauthUri(secret, user.email, (await resolveBranding()).fullName);
      return NextResponse.json({
        mfa: "setup",
        mfaToken: createPendingToken(user, tenantKey, sealSecret(secret)),
        secret,
        qrSvg: await QRCode.toString(uri, { type: "svg", margin: 1 }),
      });
    }

    // Awaited so a failure to build the cookie lands in the catch below.
    return await finishSignIn(req, user, at);
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
  const at = new Date().toISOString();
  const device = deviceOf(req.headers.get("user-agent"));
  // afterResponse never throws and logs its own failures.
  await afterResponse(async () => {
    const claims = readSessionClaims(token);
    const user = claims ? await getUserById(claims.u) : undefined;
    const { key: tenantKey } = await tenantScope();
    if (!token || !user || !verifySessionToken(token, user, tenantKey)) return;
    await recordActivity({
      at,
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
