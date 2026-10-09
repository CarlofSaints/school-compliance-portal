import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getUserById, getUsers, updateUser, verifyPassword } from "@/lib/userData";
import { isPlausibleEmail } from "@/lib/emailIdentity";
import { createEmailChangeToken, EMAIL_CHANGE_TTL_MS } from "@/lib/emailChange";
import { sendEmailChangeConfirmEmail, sendEmailChangeNoticeEmail, isEmailConfigured } from "@/lib/email";
import { getPeople, photoUrlFor } from "@/lib/peopleData";

export async function GET(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const user = await getUserById(session.id);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const { password, ...safe } = user;

  // The register entry this login belongs to, if there is one. A photo lives
  // on the PERSON, not on the login, so that an administrator setting it from
  // Admin > People and somebody setting their own from My Account are writing
  // the same thing and cannot drift apart. It is also what the People page
  // renders, which is the whole point of uploading one.
  const people = await getPeople();
  const person = people.find((p) => p.userId === user.id);

  return NextResponse.json(
    {
      ...safe,
      person: person
        ? {
            id: person.id,
            position: person.position,
            photoUrl: photoUrlFor(person),
          }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function PUT(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  try {
    const body = await req.json();

    // Only fields that actually carry a value are applied. A form that posts
    // an empty name is a form that has not finished loading, not somebody
    // asking to be nameless, and updateUser merges whatever it is handed
    // straight onto the record.
    const updates: { name?: string; surname?: string } = {};
    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }
    if (typeof body.surname === "string" && body.surname.trim()) {
      updates.surname = body.surname.trim();
    }

    const current = await getUserById(session.id);
    if (!current) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 🔴 The email is NEVER written here. A different address starts a
    // confirmation (lib/emailChange.ts) and only takes effect once somebody
    // clicks the link sent to it. Before, it took effect as typed, so anybody
    // could put the chair's address on their own account and approve minutes
    // as the chair, or copy a colleague's and break their sign-in.
    const wanted = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const changingEmail = !!wanted && wanted !== current.email.trim().toLowerCase();
    if (changingEmail) {
      // sendEmail "succeeds" without a mail provider (it only logs), which
      // would tell the person a link was sent when nothing was.
      if (!isEmailConfigured()) {
        return NextResponse.json(
          { error: "Email is not set up on this portal, so the address cannot be confirmed. Ask your administrator to change it." },
          { status: 503 }
        );
      }
      if (!isPlausibleEmail(wanted)) {
        return NextResponse.json({ error: "That does not look like an email address." }, { status: 400 });
      }
      // The password, because a session left open on a shared computer must
      // not be enough to move the account somewhere else.
      if (typeof body.currentPassword !== "string" || !(await verifyPassword(current, body.currentPassword))) {
        return NextResponse.json(
          { error: "Enter your current password to change your email address." },
          { status: 400 }
        );
      }
      const users = await getUsers();
      if (users.some((u) => u.id !== current.id && u.email.trim().toLowerCase() === wanted)) {
        return NextResponse.json(
          { error: "That email address is already used by another account." },
          { status: 409 }
        );
      }
    }

    if (!changingEmail && Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    // The confirmation goes out FIRST, so a send that fails changes nothing
    // at all, names included, and the message can truthfully say so.
    let pendingEmail: string | undefined;
    if (changingEmail) {
      const name = `${current.name} ${current.surname}`.trim();
      const sent = await sendEmailChangeConfirmEmail(
        wanted,
        name,
        createEmailChangeToken(current, wanted),
        EMAIL_CHANGE_TTL_MS / 3_600_000
      );
      if (!sent) {
        return NextResponse.json(
          { error: "Could not send the confirmation email to that address. Nothing has changed." },
          { status: 502 }
        );
      }
      // Fire and forget: a notice that fails must not undo the request.
      sendEmailChangeNoticeEmail(current.email, name, wanted, "requested").catch(() => {});
      pendingEmail = wanted;
    }

    const updated = Object.keys(updates).length ? await updateUser(session.id, updates) : current;
    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { password, ...safe } = updated;
    return NextResponse.json({ ...safe, pendingEmail });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
