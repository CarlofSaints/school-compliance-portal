import { NextRequest, NextResponse } from "next/server";
import { readFile, listFiles } from "@/lib/controlData";
import { requireLogin } from "@/lib/rolesData";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  // Behind sign-in now that the session is a cookie, which an <img> request
  // does carry. It was public only because the old x-user-id header could not
  // ride along with an image.
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const { userId } = await params;
  if (!UUID.test(userId)) {
    return NextResponse.json({ error: "No avatar found" }, { status: 404 });
  }

  try {
    const files = await listFiles(`users/${userId}`);
    const avatarFile = files
      .filter((f) => f.startsWith("avatar-"))
      .sort()
      .pop();

    if (!avatarFile) {
      return NextResponse.json({ error: "No avatar found" }, { status: 404 });
    }

    const buffer = await readFile(`users/${userId}/${avatarFile}`);
    if (!buffer) {
      return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
    }

    const ext = avatarFile.split(".").pop() || "png";
    const contentType =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "png"
        ? "image/png"
        : "image/webp";

    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": contentType },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to load avatar" },
      { status: 500 }
    );
  }
}
