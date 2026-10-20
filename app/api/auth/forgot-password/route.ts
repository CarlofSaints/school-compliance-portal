import { NextRequest, NextResponse } from "next/server";
import { LIMITS, enforce, ipOf } from "@/lib/rateLimit";
import { getUserByEmail } from "@/lib/userData";
import { createResetToken, RESET_TTL_MS } from "@/lib/passwordReset";
import { sendPasswordResetLinkEmail, isEmailConfigured } from "@/lib/email";
import { recordActivity } from "@/lib/activityLog";
import { actorFromUser, afterResponse } from "@/lib/activityActor";
import { deviceOf } from "@/lib/signinLog";

// Unauthenticated by design — the whole point is that the caller cannot log in.
export async function POST(req: NextRequest) {
  // One answer for every outcome. A different reply for "no such account"
  // turns this into a way to find out who has a login at the school, and the
  // person who genuinely mistyped their address is no better off for being
  // told, because they still cannot get in.
  const same = NextResponse.json({
    message:
      "If that email address has an account, a reset link is on its way. It expires in an hour.",
  });

  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") return same;

    // Each request sends an email (paid) to a real inbox: limited per
    // connection and per address. Counted for every address, account or not,
    // so the limit itself does not reveal who has a login.
    const limited = await enforce([
      [LIMITS.resetRequestIp, ipOf(req)],
      [LIMITS.resetRequestEmail, email.trim().toLowerCase()],
    ]);
    if (limited) return limited;

    // The lookup and the send run AFTER the reply, so it takes the same time
    // (and is the same answer) for an address with an account or without, and
    // whether or not email is set up. Failures go to the server log.
    const ip = ipOf(req);
    const device = deviceOf(req.headers.get("user-agent"));
    await afterResponse(async () => {
      const user = await getUserByEmail(email.trim());
      if (!user) return;
      if (!isEmailConfigured()) {
        // sendEmail() logs and returns true when Resend is not wired up.
        console.error("[forgot-password] No RESEND_API_KEY, cannot send to", user.id);
        return;
      }
      const at = new Date().toISOString();
      const sent = await sendPasswordResetLinkEmail(
        user.email,
        user.name,
        createResetToken(user),
        Math.round(RESET_TTL_MS / 60000)
      );
      if (!sent) {
        console.error("[forgot-password] Send failed for", user.id);
        return;
      }
      // Only for a real account: an unknown address is not logged, or the
      // log would fill with whatever a stranger types into a public form.
      await recordActivity({
        at,
        ...actorFromUser(req, user),
        ip,
        action: "auth.password_reset_requested",
        entity: "password",
        entityId: user.id,
        summary: "Asked for a password reset link",
        detail: { device },
      });
    });
    return same;
  } catch (err) {
    console.error("[forgot-password] Failed:", err);
    // Still the neutral answer — a malformed body must not read differently
    // from an unknown address.
    return same;
  }
}
