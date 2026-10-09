import { NextRequest, NextResponse } from "next/server";
import { requirePermission, maySelfTag, sameIds } from "@/lib/rolesData";
import { getPersonById, updatePerson, deletePerson, personFieldsFrom, isOwnPhotoPath } from "@/lib/peopleData";
import { deleteFile, listFiles } from "@/lib/controlData";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "manage_people");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const person = await getPersonById(id);
  if (!person) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }
  return NextResponse.json(person);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "manage_people");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  try {
    const body = await req.json();
    const fields = personFieldsFrom(body ?? {});

    // Tags carry approval authority. Linking a tagged entry to your own login,
    // or changing the tags on the entry that is you, is a way to hand yourself
    // that authority, so it needs manage_roles.
    const existing = await getPersonById(id);
    if (existing && !maySelfTag(session)) {
      const nextUserId = fields.userId !== undefined ? fields.userId : existing.userId;
      const nextTags = fields.tagIds ?? existing.tagIds ?? [];
      const tagsChanged = !sameIds(nextTags, existing.tagIds);
      // An entry carrying your own login email is you too: minutes access and
      // distribution recognise a register entry by its email, so putting your
      // address on a FINCOM-tagged entry would otherwise hand you FINCOM.
      const mine = (e: string | undefined | null) =>
        !!session.email && String(e || "").trim().toLowerCase() === session.email.trim().toLowerCase();
      const nextEmail = fields.email !== undefined ? fields.email : existing.email;
      const wasMe = existing.userId === session.id || mine(existing.email);
      const willBeMe = nextUserId === session.id || mine(nextEmail);
      const becomesMe = willBeMe && !wasMe;
      const isMe = wasMe || willBeMe;
      if ((isMe && tagsChanged) || (becomesMe && nextTags.length > 0)) {
        return NextResponse.json(
          { error: "You cannot change the tags on your own People entry, or link a tagged entry to your own login or email. Ask a Super Admin." },
          { status: 403 }
        );
      }
    }

    const updated = await updatePerson(id, fields);
    if (!updated) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "manage_people");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  // Their photo goes with them. Without this the image file stays in storage
  // for good, reachable by anyone who kept the URL, with no record left in the
  // register pointing at it to say whose face it is.
  const person = await getPersonById(id);

  const deleted = await deletePerson(id);
  if (!deleted) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }

  // Every photo file, not only the one the record names: a replacement whose
  // record update was lost would otherwise leave a face in storage that
  // nothing points at any more.
  const files = await listFiles(`people/${id}`);
  await Promise.all(
    files
      .filter((f) => f.startsWith("photo-"))
      .map((f) => deleteFile(`people/${id}/${f}`))
  );
  if (person && isOwnPhotoPath(person.id, person.profilePic)) await deleteFile(person.profilePic);

  return NextResponse.json({ success: true });
}
