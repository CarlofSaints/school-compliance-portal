import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { getPersonById, updatePerson } from "@/lib/peopleData";
import { writeFile, readFile, deleteFile } from "@/lib/controlData";

export const dynamic = "force-dynamic";

// What the browser is allowed to send, and what each maps to on the way back
// out. This is the SERVER's list; the file input's accept attribute must agree
// with it, or a picture the form happily accepts is refused on upload.
const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// The upload is resized to a 512px square in the browser before it is sent, so
// anything arriving much above this is not a photo taking the intended path.
const MAX_BYTES = 2 * 1024 * 1024;

function extensionOf(person: { profilePic: string }): string {
  return person.profilePic.split(".").pop()?.toLowerCase() || "jpg";
}

// Serves a person's photo.
//
// Deliberately not behind requirePermission: a session here is carried in an
// x-user-id header, and a browser rendering <img src="..."> cannot send one, so
// a gated route would return 401 to every image tag on the page. This mirrors
// the existing /api/account/avatar/[userId] route. The id is a uuid, and the
// response is a face and a nothing else, but treat the URL as guessable rather
// than secret.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const person = await getPersonById(id);
  if (!person || !person.profilePic) {
    return NextResponse.json({ error: "No photo" }, { status: 404 });
  }

  const buffer = await readFile(person.profilePic);
  if (!buffer) {
    return NextResponse.json({ error: "No photo" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": IMAGE_TYPES[extensionOf(person)] || "image/jpeg",
      // Callers append ?v=<filename>, which changes whenever the photo is
      // replaced, so this can be cached hard without ever going stale. Kept
      // private so a shared CDN does not hold on to staff faces.
      "Cache-Control": "private, max-age=86400",
    },
  });
}

export async function POST(
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

  try {
    const formData = await req.formData();
    const file = formData.get("photo") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No photo provided" }, { status: 400 });
    }

    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!IMAGE_TYPES[ext]) {
      return NextResponse.json(
        { error: "Use a JPG, PNG or WebP image." },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "That image is too large. Please use one under 2MB." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // The timestamp is what makes the ?v= cache buster work, and it means a
    // replacement never overwrites the file a page is still displaying.
    const blobPath = `people/${id}/photo-${Date.now()}.${ext}`;
    await writeFile(blobPath, buffer);

    const previous = person.profilePic;
    const updated = await updatePerson(id, { profilePic: blobPath });

    // Only after the record points at the new file, so a failure here leaves a
    // stray file rather than a person pointing at one that is gone.
    if (previous && previous !== blobPath) {
      await deleteFile(previous);
    }

    return NextResponse.json(
      { profilePic: blobPath, person: updated },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "That photo could not be saved." },
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
  const person = await getPersonById(id);
  if (!person) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }

  if (person.profilePic) {
    await deleteFile(person.profilePic);
    await updatePerson(id, { profilePic: "" });
  }

  return NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
