import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getMinutes, readSignatureImage } from "@/lib/minutesData";

// A signatory's mark, as a PNG.
//
// Only a login, like every other read in this module: minutes are what the
// governing body agreed, and who signed them is part of that.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; email: string }> }
) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const { id, email } = await params;
  const address = decodeURIComponent(email);

  const record = await getMinutes(id);
  // 🔴 Only for somebody actually on the signing list. Without this the route
  // is an arbitrary read of `minutes/<id>/signatures/<anything>.png`, driven by
  // a path segment a caller controls.
  const signatory = record?.signatories.find(
    (s) => s.email.trim().toLowerCase() === address.trim().toLowerCase()
  );
  if (!signatory?.signedAt) {
    return NextResponse.json({ error: "No signature" }, { status: 404 });
  }

  const bytes = await readSignatureImage(id, address);
  if (!bytes) {
    return NextResponse.json({ error: "No signature" }, { status: 404 });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      // A signature never changes once made, and the record locks when signing
      // completes, so it is safe to hold. Private: it is somebody's signature.
      "Cache-Control": "private, max-age=3600",
      "Content-Length": String(bytes.length),
    },
  });
}
