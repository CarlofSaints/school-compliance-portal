import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { readFile } from "@/lib/controlData";
import { contentDisposition } from "@/lib/contentDisposition";
import { FILE_PATHS, getInvoices, getSignatures } from "@/lib/paymentData";
import { signedInvoicePdf } from "@/lib/paymentSignedPdf";

// The invoice with its signature page. Opens in the browser; ?download=1 saves it.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAnyPermission(req, ["view_payments", "manage_payments"]);
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const invoice = (await getInvoices()).find((i) => i.id === id);
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  const signatures = await getSignatures(id);
  if (!signatures.length) return NextResponse.json({ error: "This invoice has not been signed yet." }, { status: 409 });
  const original = await readFile(FILE_PATHS.invoice(id, invoice));
  if (!original) return NextResponse.json({ error: "File not found." }, { status: 404 });

  const bytes = await signedInvoicePdf(invoice, original, signatures);
  const name = `Signed - ${invoice.filename.replace(/\.[^.]+$/, "")}.pdf`;
  const disposition = contentDisposition(name);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": req.nextUrl.searchParams.get("download") ? disposition : disposition.replace(/^attachment/, "inline"),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
