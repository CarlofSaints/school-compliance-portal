import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/userData";
import { createResetToken, RESET_TTL_MS } from "@/lib/passwordReset";
import { sendPasswordResetLinkEmail, isEmailConfigured } from "@/lib/email";

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

    // Trim before the lookup. getUserByEmail lowercases both sides but does not
    // trim, and an address pasted into the form with a trailing space would
    // otherwise miss an account that is sitting right there.
    const user = await getUserByEmail(email.trim());
    if (!user) return same;

    if (!isEmailConfigured()) {
      // sendEmail() logs and returns true when Resend is not wired up, so
      // without this the caller would be told a link was sent that never was.
      console.error("[forgot-password] No RESEND_API_KEY — cannot send to", user.email);
      return NextResponse.json(
        {
          error:
            "Password reset email is not configured on this site. Please contact your administrator.",
        },
        { status: 503 }
      );
    }

    const token = createResetToken(user);
    const sent = await sendPasswordResetLinkEmail(
      user.email,
      user.name,
      token,
      Math.round(RESET_TTL_MS / 60000)
    );
    if (!sent) {
      console.error("[forgot-password] Send failed for", user.email);
      return NextResponse.json(
        { error: "The reset email could not be sent. Please try again shortly." },
        { status: 502 }
      );
    }
    return same;
  } catch (err) {
    console.error("[forgot-password] Failed:", err);
    // Still the neutral answer — a malformed body must not read differently
    // from an unknown address.
    return same;
  }
}
