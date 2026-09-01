import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getUserById, updateUser } from "@/lib/userData";
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
    const updates: { name?: string; surname?: string; email?: string } = {};
    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }
    if (typeof body.surname === "string" && body.surname.trim()) {
      updates.surname = body.surname.trim();
    }
    if (typeof body.email === "string" && body.email.trim()) {
      updates.email = body.email.trim();
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Nothing to update." },
        { status: 400 }
      );
    }

    const updated = await updateUser(session.id, updates);
    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const { password, ...safe } = updated;
    return NextResponse.json(safe);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
