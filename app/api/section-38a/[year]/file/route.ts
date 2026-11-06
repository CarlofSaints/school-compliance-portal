import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { contentDisposition } from "@/lib/contentDisposition";
import { deleteFile, readFile, writeFile } from "@/lib/controlData";
import { uploadedFile } from "@/lib/paymentData";
import { cleanFilename } from "@/lib/payments";
import type { FileRef } from "@/lib/section38a";
import { changeYear, filePath, getYear, guard } from "@/lib/section38aData";

type Ctx = { params: Promise<{ year: string }> };
const kindOf = (req: NextRequest) => {
  const kind = req.nextUrl.searchParams.get("kind");
  return kind === "proof" || kind === "letter" ? kind : null;
};

// Proof of lodging, and the Head of Department's letter.
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await guard(req, (await params).year);
  if (auth instanceof NextResponse) return auth;
  const kind = kindOf(req);
  if (!kind) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  const before = await getYear(auth.year);
  if (!before.lodged) return NextResponse.json({ error: "Mark the application as lodged first." }, { status: 409 });
  const file = await uploadedFile(req, ["pdf", "png", "jpg"]);
  if (file instanceof NextResponse) return file;

  const ref: FileRef = { name: cleanFilename(file.name), ext: file.ext, at: new Date().toISOString(), by: `${auth.session.name} ${auth.session.surname}`.trim() };
  const old = kind === "letter" ? before.letter : before.lodged.proof;
  await writeFile(filePath(auth.year, kind, ref), file.bytes);
  await changeYear(auth.year, (y) => (kind === "letter" ? { ...y, letter: ref } : { ...y, lodged: y.lodged && { ...y.lodged, proof: ref } }));
  if (old && old.ext !== ref.ext) await deleteFile(filePath(auth.year, kind, old));
  await recordActivity({ ...actorFrom(req, auth.session), action: `section38a.${kind}_uploaded`, entity: "section_38a", entityId: String(auth.year), summary: `Uploaded the section 38A ${kind === "letter" ? "decision letter" : "proof of lodging"} for ${auth.year}` });
  return NextResponse.json({ success: true }, { status: 201 });
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await guard(req, (await params).year);
  if (auth instanceof NextResponse) return auth;
  const kind = kindOf(req);
  const y = await getYear(auth.year);
  const ref = kind === "letter" ? y.letter : kind === "proof" ? y.lodged?.proof : undefined;
  const bytes = kind && ref ? await readFile(filePath(auth.year, kind, ref)) : null;
  if (!ref || !bytes) return NextResponse.json({ error: "File not found." }, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/octet-stream", "Content-Disposition": contentDisposition(ref.name), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" },
  });
}
