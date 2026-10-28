import { NextRequest, NextResponse } from "next/server";
import { LIMITS, hit, clear, tooMany, ipOf } from "@/lib/rateLimit";
import { getUserById } from "@/lib/userData";
import { recordActivity } from "@/lib/activityLog";
import { afterResponse, actorFromUser } from "@/lib/activityActor";
import { countSignIn, deviceOf } from "@/lib/signinLog";
import { isSameOriginWrite } from "@/lib/session";
import { tenantScope } from "@/lib/tenantContext";
import { finishSignIn } from "@/lib/signIn";
import { readPendingClaims, verifyPendingToken, checkCode, enrol } from "@/lib/mfa";

// Step two of a Super Admin sign-in: the token from POST /api/auth (right
// password) plus a code from their authenticator app, or a backup code. On a
// first sign-in the token carries a new secret and the code sets it up.
export async function POST(req: NextRequest) {
  if (!isSameOriginWrite(req.method, req.headers.get("origin"), req.headers.get("x-forwarded-host") || req.headers.get("host"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const at = new Date().toISOString();
    // Counted before any lookup, shared with password attempts, so made-up
    // tokens cannot make one connection cost unlimited storage reads.
    const ipHit = await hit(LIMITS.loginIp, ipOf(req));
    if (!ipHit.ok) return tooMany(LIMITS.loginIp, ipHit);
    const { mfaToken, code } = await req.json();
    const claims = readPendingClaims(mfaToken);
    const user = claims ? await getUserById(claims.u) : undefined;
    const { key: tenantKey } = await tenantScope();
    const pending = user ? verifyPendingToken(String(mfaToken), user, tenantKey) : null;
    if (!user || !pending) {
      return NextResponse.json({ error: "Your sign-in timed out. Please sign in again.", restart: true }, { status: 400 });
    }
    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Enter the code from your app." }, { status: 400 });
    }

    for (const limit of [LIMITS.mfaAccountDay, LIMITS.mfaAccount]) {
      const limited = await hit(limit, user.id);
      if (!limited.ok) return tooMany(limit, limited);
    }

    const actor = { ...actorFromUser(req, user), ip: ipOf(req) };
    const device = deviceOf(req.headers.get("user-agent"));
    const log = (action: string, summary: string, detail: Record<string, unknown> = {}) =>
      afterResponse(() =>
        recordActivity({ at, ...actor, action, entity: "auth", entityId: user.id, summary, detail: { ...detail, device } })
      );
    // A wrong code is a failed sign-in, in the log and in the sign-in tally.
    const failed = (summary: string) =>
      afterResponse(() =>
        Promise.all([
          recordActivity({ at, ...actor, action: "auth.mfa_failed", entity: "auth", entityId: user.id, summary, detail: { reason: "wrong_code", device } }),
          countSignIn(user, "failed", actor.ip, device, at),
        ])
      );

    if (pending.s) {
      const backupCodes = await enrol(user.id, pending.s, code);
      if (backupCodes === "exists") {
        // Set up already (another tab, or a lost reply): not a wrong code.
        await clear(LIMITS.mfaAccount, user.id);
        return NextResponse.json({ error: "Two-step sign-in is already set up. Please sign in again and enter the code from your app.", restart: true }, { status: 400 });
      }
      if (!backupCodes) {
        await failed("Wrong code while setting up two-step sign-in");
        return NextResponse.json({ error: "That code is not right. Check the time on your phone and try the newest code." }, { status: 400 });
      }
      await clear(LIMITS.mfaAccount, user.id);
      await log("auth.mfa_enabled", "Set up two-step sign-in");
      return await finishSignIn(req, user, at, { backupCodes });
    }

    const { result, backupLeft } = await checkCode(user.id, code);
    if (result === "wrong") {
      await failed("Failed sign-in: wrong two-step code");
      return NextResponse.json({ error: "That code is not right. Try the newest code, or a backup code." }, { status: 400 });
    }
    await clear(LIMITS.mfaAccount, user.id);
    if (result === "backup") {
      await log("auth.mfa_backup_used", `Signed in with a backup code (${backupLeft} left)`, { backupLeft });
    }
    return await finishSignIn(req, user, at, result === "backup" ? { backupLeft } : {});
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
