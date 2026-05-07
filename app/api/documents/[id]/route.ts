import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { getDocumentById, deleteDocument, downloadDocumentFile, getDocumentChecks } from "@/lib/documentData";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "check_documents");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const doc = await getDocumentById(id);
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const download = req.nextUrl.searchParams.get("download");
  if (download === "true") {
    const buffer = await downloadDocumentFile(id, doc.filename);
    if (!buffer) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${doc.filename}"`,
      },
    });
  }

  const checks = await getDocumentChecks(id);
  return NextResponse.json({ document: doc, checks });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "check_documents");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const deleted = await deleteDocument(id);
  if (!deleted) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
