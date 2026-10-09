import { NextRequest, NextResponse } from "next/server";
import { requirePermission, maySelfTag } from "@/lib/rolesData";
import { getPeople, createPerson, photoUrlFor, isOwnPhotoPath } from "@/lib/peopleData";
import { v4 as uuidv4 } from "uuid";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const session = await requirePermission(req, "manage_people");
  if (session instanceof NextResponse) return session;

  const people = await getPeople();
  // photoUrl alongside the raw record so the admin list renders thumbnails
  // from the same URL the directory uses, rather than building its own.
  return NextResponse.json(
    people.map((p) => ({ ...p, photoUrl: photoUrlFor(p) })),
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_people");
  if (session instanceof NextResponse) return session;

  try {
    const body = await req.json();
    const { id, position, userId, name, email, phone, profilePic, tagIds } = body;
    if (!position) {
      return NextResponse.json(
        { error: "Position is required" },
        { status: 400 }
      );
    }

    // The caller may name the id. A photo has to be stored under the person's
    // own path, and people.json takes a moment to propagate, so a create that
    // uploaded afterwards raced the register and lost. Knowing the id up front
    // lets the photo go up first and arrive WITH the record.
    const supplied = typeof id === "string" && UUID.test(id) ? id : null;

    // Same rule as editing: a tagged entry linked to your own login hands you
    // that tag's approval authority.
    const ownEmail =
      !!session.email &&
      typeof email === "string" &&
      email.trim().toLowerCase() === session.email.trim().toLowerCase();
    if ((userId === session.id || ownEmail) && Array.isArray(tagIds) && tagIds.length > 0 && !maySelfTag(session)) {
      return NextResponse.json(
        { error: "You cannot create a tagged People entry linked to your own login or email. Ask a Super Admin." },
        { status: 403 }
      );
    }

    const person = {
      id: supplied || uuidv4(),
      position,
      userId: userId || null,
      name: name || "",
      email: email || "",
      phone: phone || "",
      // Only a photo already stored at this person's own path.
      profilePic: isOwnPhotoPath(supplied || "", profilePic) ? profilePic : "",
      // Was dropped here: the form sends tagIds, so a person created with tags
      // silently arrived with none. Editing them afterwards worked, which is
      // what made it look like the tags had simply not been ticked.
      tagIds: Array.isArray(tagIds) ? tagIds : [],
    };
    await createPerson(person);

    // The created record, not just an ack: the caller needs the new id to
    // attach a photo straight afterwards.
    return NextResponse.json(person, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
