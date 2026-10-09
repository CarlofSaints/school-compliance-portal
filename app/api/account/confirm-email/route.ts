import { NextRequest, NextResponse } from "next/server";
import { getUserById, getUsers, updateUser } from "@/lib/userData";
import { readEmailChangeClaims, verifyEmailChangeToken } from "@/lib/emailChange";
import { sendEmailChangeNoticeEmail } from "@/lib/email";
import { isSameOriginWrite } from "@/lib/session";
import { recordActivity } from "@/lib/activityLog";

// Finishes an email change (lib/emailChange.ts).
//
// Deliberately NOT behind a sign-in: the link is opened from a mailbox, often
// on a phone that has never signed in. The signed token is the proof, and it
// is tied to the account's current password and email, so it works once.
//
// POST, never GET. Mail scanners open every link in a message on their own; a
// GET that changed the address would confirm it before the person ever saw it.
export async function POST(req: NextRequest) {
  if (
    !isSameOriginWrite(
      req.method,
      req.headers.get("origin"),
      req.headers.get("x-forwarded-host") || req.headers.get("host")
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { token } = await req.json().catch(() => ({ token: "" }));
  const claims = readEmailChangeClaims(String(token || ""));
  const user = claims ? await getUserById(claims.u) : undefined;
  const check = user ? verifyEmailChangeToken(String(token), user) : "invalid";

  if (!claims || !user || check === "invalid") {
    return NextResponse.json(
      { error: "This link is not valid. It may already have been used, or the password changed since it was sent." },
      { status: 400 }
    );
  }
  if (check === "expired") {
    return NextResponse.json(
      { error: "This link has expired. Change your email again from My Account to get a new one." },
      { status: 410 }
    );
  }

  // Checked again: someone else may have taken the address since the link went out.
  const users = await getUsers();
  if (users.some((u) => u.id !== user.id && u.email.trim().toLowerCase() === claims.n)) {
    return NextResponse.json({ error: "That email address is already used by another account." }, { status: 409 });
  }

  const oldEmail = user.email;
  const updated = await updateUser(user.id, { email: claims.n });
  if (!updated) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const name = `${updated.name} ${updated.surname}`.trim();
  sendEmailChangeNoticeEmail(oldEmail, name, claims.n, "changed").catch(() => {});
  await recordActivity({
    actorId: user.id,
    actorName: name,
    action: "account.email.changed",
    entity: "user",
    entityId: user.id,
    summary: `Changed their email address to ${claims.n} (confirmed from that address)`,
  }).catch(() => {});

  return NextResponse.json({ success: true, email: claims.n });
}
