import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { getUserById } from "@/lib/userData";
import { sendPasswordResetLinkEmail, isEmailConfigured } from "@/lib/email";
import { createResetToken, RESET_TTL_MS } from "@/lib/passwordReset";

// Sends the user a link to SET their own password.
//
// This route used to email `body.tempPassword || "ChangeMe@123"` and never
// write it to the account, so the recipient was handed a password that had
// never worked and never would. You cannot resend a password — a hash is
// one-way, so the only honest options are to mint a new one or, as here, to
// let the person choose their own.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "manage_users");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const user = await getUserById(id);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!isEmailConfigured()) {
    // sendEmail() returns true and merely logs when Resend is absent, which
    // would report a send that never happened.
    return NextResponse.json(
      { error: "Email is not configured on this site." },
      { status: 503 }
    );
  }

  try {
    const token = createResetToken(user);
    const sent = await sendPasswordResetLinkEmail(
      user.email,
      user.name,
      token,
      Math.round(RESET_TTL_MS / 60000)
    );
    if (!sent) {
      return NextResponse.json(
        { error: "Failed to send email" },
        { status: 502 }
      );
    }
    return NextResponse.json({ success: true, sentTo: user.email });
  } catch (err) {
    console.error("[users/notify] Failed:", err);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
