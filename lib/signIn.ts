import { NextRequest, NextResponse } from "next/server";
import type { User } from "./userData";
import { getRoleById, resolveRolePermissions } from "./rolesData";
import { recordActivity } from "./activityLog";
import { afterResponse, actorFromUser } from "./activityActor";
import { countSignIn, deviceOf } from "./signinLog";
import { ipOf } from "./rateLimit";
import { SessionPayload } from "./roles";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions, isHttps } from "./session";
import { tenantScope } from "./tenantContext";

/** The last step of every sign-in: the cookie, and the "Signed in" log entry.
 *  Shared by the password route and the MFA code route, so a two-step sign-in
 *  ends exactly like a one-step one. `extra` goes into the reply body. */
export async function finishSignIn(
  req: NextRequest,
  user: User,
  at: string,
  extra: Record<string, unknown> = {}
): Promise<NextResponse> {
  const ip = ipOf(req);
  const device = deviceOf(req.headers.get("user-agent"));
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
    ...extra,
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
        at,
        ...actorFromUser(req, user),
        ip,
        action: "auth.sign_in",
        entity: "auth",
        entityId: user.id,
        summary: "Signed in",
        detail: { device },
      }),
      countSignIn(user, "ok", ip, device, at),
    ])
  );
  return res;
}
