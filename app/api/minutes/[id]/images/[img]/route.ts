import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getMinutes } from "@/lib/minutesData";
import { sessionMayReadMinutes } from "@/lib/minutesAccess";
import { imageKind, readMinutesImage } from "@/lib/minutesImages";

/** A picture from a section, for whoever may read these minutes. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; img: string }> }) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  const { id, img } = await params;
  const record = await getMinutes(id);
  if (!record || !(await sessionMayReadMinutes(session, record))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const bytes = await readMinutesImage(id, img);
  const kind = bytes && imageKind(bytes);
  if (!bytes || !kind) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": kind === "png" ? "image/png" : "image/jpeg",
      "X-Content-Type-Options": "nosniff",
      // Named by its own hash, so it can never change under the same address.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
