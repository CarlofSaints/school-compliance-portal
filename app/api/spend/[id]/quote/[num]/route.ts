import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getSpendById, downloadQuoteFile } from "@/lib/spendData";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; num: string }> }
) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const { id, num } = await params;
  const app = await getSpendById(id);
  if (!app) {
    return NextResponse.json(
      { error: "Spend application not found" },
      { status: 404 }
    );
  }

  // Check access
  if (
    app.submittedBy !== session.id &&
    !session.permissions.includes("view_all_spend") &&
    !session.permissions.includes("approve_spend")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const quoteIndex = parseInt(num, 10) - 1;
  if (quoteIndex < 0 || quoteIndex >= app.quotes.length) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  const quotePath = app.quotes[quoteIndex];
  const buffer = await downloadQuoteFile(quotePath);
  if (!buffer) {
    return NextResponse.json(
      { error: "Quote file not found" },
      { status: 404 }
    );
  }

  const ext = quotePath.split(".").pop() || "pdf";
  const contentTypes: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Content-Disposition": `attachment; filename="quote-${num}.${ext}"`,
    },
  });
}
