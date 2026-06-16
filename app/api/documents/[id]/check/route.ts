import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { getDocumentById, downloadDocumentFile, saveDocumentCheck } from "@/lib/documentData";
import { runComplianceCheckOnFile } from "@/lib/complianceEngine";
import { v4 as uuidv4 } from "uuid";

export async function POST(
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

  try {
    const fileBuffer = await downloadDocumentFile(id, doc.filename);
    if (!fileBuffer) {
      return NextResponse.json(
        { error: "Could not read document file" },
        { status: 500 }
      );
    }

    const result = await runComplianceCheckOnFile(
      fileBuffer,
      doc.ext,
      doc.name,
      "document"
    );

    const checkId = uuidv4();
    const check = {
      id: checkId,
      documentId: id,
      score: result.score,
      summary: result.summary,
      risks: result.risks,
      checkedBy: session.id,
      checkedAt: new Date().toISOString(),
    };

    await saveDocumentCheck(id, check);

    return NextResponse.json(check);
  } catch (err) {
    console.error("Document check failed:", err);
    return NextResponse.json(
      { error: "Document check failed. Check API key configuration." },
      { status: 500 }
    );
  }
}
