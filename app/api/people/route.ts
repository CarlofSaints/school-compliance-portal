import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { getPeople, createPerson, photoUrlFor } from "@/lib/peopleData";
import { v4 as uuidv4 } from "uuid";

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
    const { position, userId, name, email, phone, profilePic, tagIds } = body;
    if (!position) {
      return NextResponse.json(
        { error: "Position is required" },
        { status: 400 }
      );
    }

    const person = {
      id: uuidv4(),
      position,
      userId: userId || null,
      name: name || "",
      email: email || "",
      phone: phone || "",
      profilePic: profilePic || "",
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
