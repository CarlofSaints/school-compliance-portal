import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { readFile } from "@/lib/controlData";
import { contentDisposition } from "@/lib/contentDisposition";
import { FILE_PATHS, getNoticeSignatures, getScreens, getSigningSlots } from "@/lib/paymentData";
import { signedNoticePdf } from "@/lib/paymentSignedPdf";
import { noticeSlots } from "@/lib/payments";

// The payment notice with our stamp on it. Opens in the browser; ?download=1 saves it.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAnyPermission(req, ["view_payments", "manage_payments"]);
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const notice = (await getScreens()).find((s) => s.id === id && s.kind !== "statement");
  if (!notice) return NextResponse.json({ error: "Payment notice not found." }, { status: 404 });
  const signatures = await getNoticeSignatures(id);
  if (!signatures.length) return NextResponse.json({ error: "This payment notice has not been signed yet." }, { status: 409 });
  const original = await readFile(FILE_PATHS.screen(id, notice));
  if (!original) return NextResponse.json({ error: "File not found." }, { status: 404 });

  const bytes = await signedNoticePdf(notice, original, signatures, noticeSlots(notice, await getSigningSlots([notice])));
  const disposition = contentDisposition(`Signed - ${notice.filename.replace(/\.[^.]+$/, "")}.pdf`);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": req.nextUrl.searchParams.get("download") ? disposition : disposition.replace(/^attachment/, "inline"),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
