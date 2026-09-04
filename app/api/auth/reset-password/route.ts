import { NextRequest, NextResponse } from "next/server";
import { getUserById, updateUser } from "@/lib/userData";
import { parseResetToken, verifyResetToken } from "@/lib/passwordReset";

const EXPIRED = "That reset link has expired. Please request a new one.";
const INVALID =
  "That reset link is no longer valid. It may already have been used. Please request a new one.";

// Shared so GET (does the page even bother rendering a form?) and POST (do the
// thing) can never disagree about whether a link is good.
async function check(token: unknown) {
  const parsed = parseResetToken(String(token ?? ""));
  if (!parsed) return { ok: false as const, status: 400, error: INVALID };

  const user = await getUserById(parsed.userId);
  // A deleted account must read exactly like a bad signature, or the token
  // becomes a way to ask whether a given user id still exists.
  if (!user) return { ok: false as const, status: 400, error: INVALID };

  const result = verifyResetToken(parsed, user);
  if (result === "expired")
    return { ok: false as const, status: 400, error: EXPIRED };
  if (result !== "valid")
    return { ok: false as const, status: 400, error: INVALID };

  return { ok: true as const, user };
}

// Lets the reset page show "this link has expired" up front rather than after
// the person has typed a new password twice.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const r = await check(token);
  if (!r.ok) return NextResponse.json({ valid: false, error: r.error });
  return NextResponse.json({ valid: true, email: r.user.email });
}

export async function POST(req: NextRequest) {
  try {
    const { token, newPassword } = await req.json();

    // Validate the password BEFORE spending the token, so "too short" does not
    // silently burn the link and force another round trip through email.
    if (!newPassword || typeof newPassword !== "string") {
      return NextResponse.json(
        { error: "A new password is required" },
        { status: 400 }
      );
    }
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const r = await check(token);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

    // Clearing forcePasswordChange matters: somebody who never managed to use
    // their welcome password arrives here, and sending them straight back to a
    // "you must change your password" screen would be absurd.
    const updated = await updateUser(r.user.id, {
      password: newPassword,
      forcePasswordChange: false,
    });
    if (!updated) {
      // updateUser finds the account by id in the shared index. The token is
      // already proven against the user's own copy, so this means the index is
      // missing them — recoverable, but not from here.
      console.error("[reset-password] Not in user index:", r.user.id);
      return NextResponse.json(
        {
          error:
            "Your password could not be saved. Please contact your administrator.",
        },
        { status: 500 }
      );
    }

    // The new hash re-keys the signature, so this token and every other one
    // ever issued for the account is now dead. Nothing to clean up.
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[reset-password] Failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
