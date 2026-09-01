import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { getPersonById, updatePerson, deletePerson } from "@/lib/peopleData";
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
    const updated = await updatePerson(id, body);
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
  if (person?.profilePic) await deleteFile(person.profilePic);

  return NextResponse.json({ success: true });
}
