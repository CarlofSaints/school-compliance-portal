import { NextRequest, NextResponse } from "next/server";
import { readFile, listFiles } from "@/lib/controlData";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

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
