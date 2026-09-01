import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getPersonById, updatePerson } from "@/lib/peopleData";
import { writeFile, readFile, deleteFile, listFiles } from "@/lib/controlData";

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Who may set or clear a person's photo: an administrator, or that person
// themselves.
//
// Somebody uploading their own photograph from My Account is not an
// administrative act, and requiring manage_people for it would mean every
// governor had to ask an admin to put their face on the register. The owner
// check is on the register's OWN record of who the login belongs to
// (person.userId), never on anything the request supplies.
//
// Note this deliberately does NOT fall back to allowing the upload when the
// person cannot be read yet. A create races the register (see the comment on
// POST), so an unknown id is treated as not-yours unless the caller is an
// admin, and the admin path is the one the create flow uses.
async function mayEditPhoto(
  session: { id: string; permissions: string[] },
  personId: string
): Promise<boolean> {
  if (session.permissions.includes("manage_people")) return true;
  const person = await getPersonById(personId);
  return !!person && person.userId === session.id;
}

// The id goes straight into a storage path, so it is checked rather than
// trusted. Nothing but a uuid is ever a real person id here.
function validId(id: string): boolean {
  return UUID.test(id);
}

// Finds a person's photo without needing their record.
//
// people.json is one shared document, and a write to it takes a moment to reach
// every instance, so a photo uploaded seconds after the person was created can
// arrive before the record naming it does. The file itself is at a path only
// this person uses, so listing that path always answers correctly. profilePic
// on the record stays as the fast path and the version marker.
async function findPhotoPath(id: string): Promise<string | null> {
  const person = await getPersonById(id);
  if (person?.profilePic) return person.profilePic;

  const files = await listFiles(`people/${id}`);
  const newest = files
    .filter((f) => f.startsWith("photo-"))
    .sort()
    .pop();
  return newest ? `people/${id}/${newest}` : null;
}

// Serves a person's photo.
//
// Deliberately not behind requirePermission: a session here is carried in an
// x-user-id header, and a browser rendering <img src="..."> cannot send one, so
// a gated route would return 401 to every image tag on the page. This mirrors
// the existing /api/account/avatar/[userId] route. The id is a uuid, and the
// response is a face and nothing else, but treat the URL as guessable rather
// than secret.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!validId(id)) {
    return NextResponse.json({ error: "No photo" }, { status: 404 });
  }

  const path = await findPhotoPath(id);
  if (!path) {
    return NextResponse.json({ error: "No photo" }, { status: 404 });
  }

  const buffer = await readFile(path);
  if (!buffer) {
    return NextResponse.json({ error: "No photo" }, { status: 404 });
  }

  const ext = path.split(".").pop()?.toLowerCase() || "jpg";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": IMAGE_TYPES[ext] || "image/jpeg",
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
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  if (!validId(id)) {
    return NextResponse.json({ error: "Invalid person id" }, { status: 400 });
  }
  if (!(await mayEditPhoto(session, id))) {
    return NextResponse.json(
      { error: "You can only change your own photo." },
      { status: 403 }
    );
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

    const previous = (await getPersonById(id))?.profilePic || "";

    const buffer = Buffer.from(await file.arrayBuffer());
    // The timestamp is what makes the ?v= cache buster work, and it means a
    // replacement never overwrites the file a page is still displaying.
    const blobPath = `people/${id}/photo-${Date.now()}.${ext}`;
    await writeFile(blobPath, buffer);

    // Best effort, and deliberately not fatal. The person may have been created
    // moments ago and not yet be visible in the shared register on this
    // instance; the file is already stored at their own path, GET finds it by
    // listing, and the caller is handed the path so a create can save it
    // straight onto the record.
    const updated = await updatePerson(id, { profilePic: blobPath });

    if (previous && previous !== blobPath) {
      await deleteFile(previous);
    }

    return NextResponse.json(
      { profilePic: blobPath, person: updated, linked: !!updated },
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
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  if (!validId(id)) {
    return NextResponse.json({ error: "Invalid person id" }, { status: 400 });
  }
  if (!(await mayEditPhoto(session, id))) {
    return NextResponse.json(
      { error: "You can only change your own photo." },
      { status: 403 }
    );
  }

  // Every photo file this person has, not only the one the record names, so a
  // replacement that lost the record update does not leave a face in storage
  // that nothing points at any more.
  const files = await listFiles(`people/${id}`);
  await Promise.all(
    files
      .filter((f) => f.startsWith("photo-"))
      .map((f) => deleteFile(`people/${id}/${f}`))
  );
  await updatePerson(id, { profilePic: "" });

  return NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
