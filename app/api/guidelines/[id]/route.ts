import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { getGuidelineById, deleteGuideline, downloadGuidelineFile } from "@/lib/guidelineData";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "manage_guidelines");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const guideline = await getGuidelineById(id);
  if (!guideline) {
    return NextResponse.json(
      { error: "Guideline not found" },
      { status: 404 }
    );
  }

  const download = req.nextUrl.searchParams.get("download");
  if (download === "true") {
    const buffer = await downloadGuidelineFile(id, guideline.ext);
    if (!buffer) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${guideline.filename}"`,
      },
    });
  }

  return NextResponse.json(guideline);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "manage_guidelines");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const deleted = await deleteGuideline(id);
  if (!deleted) {
    return NextResponse.json(
      { error: "Guideline not found" },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true });
}
