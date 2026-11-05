import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { InvoiceSignature } from "./paymentData";
import type { Invoice } from "./payments";

// ---------------------------------------------------------------------------
// The signed invoice: the original, untouched, with a signature page added at
// the end. A page of its own because a stamp over the invoice could cover its
// text. Built when asked for, from the stored file and signatures, so a second
// signature appears without anything being re-saved.
// ---------------------------------------------------------------------------

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;

// The built-in PDF font takes Latin-1 only, and throws on anything else.
const safe = (s: string) => s.replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
const when = (iso: string) => new Date(iso).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "long", timeStyle: "short" });
const rand = (n: number | null) => (n === null ? "-" : `R ${n.toFixed(2)}`);

/** Copies the invoice in. False when it cannot be: the signature page then says so. */
async function addOriginal(pdf: PDFDocument, bytes: Buffer, ext: string): Promise<boolean> {
  try {
    if (ext === "pdf") {
      const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await pdf.copyPages(source, source.getPageIndices());
      pages.forEach((p) => pdf.addPage(p));
      return pages.length > 0;
    }
    if (ext !== "png" && ext !== "jpg") return false;
    const image = ext === "png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const page = pdf.addPage(A4);
    const fit = image.scaleToFit(A4[0] - MARGIN * 2, A4[1] - MARGIN * 2);
    page.drawImage(image, { x: MARGIN, y: A4[1] - MARGIN - fit.height, ...fit });
    return true;
  } catch {
    // shortcut: an encrypted or damaged PDF, or a WEBP, gets the signature page alone; add conversion if schools hit this.
    return false;
  }
}

export async function signedInvoicePdf(invoice: Invoice, original: Buffer, signatures: InvoiceSignature[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const included = await addOriginal(pdf, original, invoice.ext);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdf.addPage(A4);
  let y = A4[1] - MARGIN;
  const line = (text: string, size = 10, f: PDFFont = font, gap = 6) => {
    if (y < MARGIN + size) {
      page = pdf.addPage(A4);
      y = A4[1] - MARGIN;
    }
    page.drawText(safe(text).slice(0, 110), { x: MARGIN, y: y - size, size, font: f, color: rgb(0.1, 0.1, 0.1) });
    y -= size + gap;
  };

  line("Signed invoice", 18, bold, 14);
  line(`File: ${invoice.filename}`);
  line(`Supplier: ${invoice.supplierName || "-"}`);
  line(`Invoice number: ${invoice.invoiceNumber || "-"}`);
  line(`Invoice date: ${invoice.invoiceDate || "-"}`);
  line(`Amount due: ${rand(invoice.amountDue)}`);
  line(`Fingerprint of the original file (SHA-256): ${invoice.hash}`, 7, font, 16);
  if (!included) line("This invoice could not be copied into this PDF. Open the original beside it.", 10, bold, 14);

  line("Signatures", 13, bold, 10);
  for (const s of signatures) {
    if (y < MARGIN + 110) {
      page = pdf.addPage(A4);
      y = A4[1] - MARGIN;
    }
    try {
      const mark = await pdf.embedPng(s.dataUrl);
      const fit = mark.scaleToFit(200, 50);
      page.drawImage(mark, { x: MARGIN, y: y - fit.height, ...fit });
      y -= fit.height + 6;
    } catch {
      line("(signature image could not be shown)", 9);
    }
    line(s.name, 11, bold, 3);
    line(`Signed ${when(s.at)}`, 9, font, 3);
    line(`Checks when signed: bank details ${s.bank}, amount ${s.amount}`, 9, font, 3);
    if (s.override) line("Signed with a check not green, after ticking that it had been looked into.", 9, bold, 3);
    y -= 14;
  }
  return pdf.save();
}
