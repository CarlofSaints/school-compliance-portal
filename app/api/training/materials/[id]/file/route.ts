import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getMaterial, getProgress, markOpened, readMaterialFile } from "@/lib/trainingData";
import { trainingGate } from "@/lib/trainingAccess";
import { contentDisposition, DOWNLOAD_CONTENT_TYPES } from "@/lib/contentDisposition";

const IMAGE_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

// The uploaded document behind a piece of material, behind the same gate as the material itself.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const material = await getMaterial(id);
  const blocked = await trainingGate(session, material && { kind: "material", id, status: material.status }, await getProgress(session.id));
  if (blocked) return blocked;
  if (!material?.file) return NextResponse.json({ error: "This material has no document." }, { status: 404 });

  const bytes = await readMaterialFile(id, material.file.ext);
  if (!bytes) return NextResponse.json({ error: "The document is missing from storage." }, { status: 404 });
  await markOpened(session.id, id);
  const ext = material.file.ext;
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": DOWNLOAD_CONTENT_TYPES[ext] || IMAGE_TYPES[ext] || "application/octet-stream",
      "Content-Disposition": contentDisposition(material.file.filename),
    },
  });
}
