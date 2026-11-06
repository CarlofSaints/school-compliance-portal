import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { InvoiceSignature, NoticeSignature } from "./paymentData";
import { fillSlots, type BankScreen, type Invoice, type SignSlot } from "./payments";

// ---------------------------------------------------------------------------
// The signed payment notice: the original with our stamp below its last page.
// Also the signed invoice from before signing moved to the notice: the original
// plus a signature page. Built when asked for, from the stored file and
// signatures, so a second signature appears without anything being re-saved.
// ---------------------------------------------------------------------------

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;

// The built-in PDF font takes Latin-1 only, and throws on anything else.
const safe = (s: string) => s.replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
const when = (iso: string) => new Date(iso).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "long", timeStyle: "short" });
const rand = (n: number | null) => (n === null ? "-" : `R ${n.toFixed(2)}`);

/** Copies the invoice in. False when it cannot be: the signature page then says so. */
async function addOriginal(pdf: PDFDocument, bytes: Buffer, ext: string, reserve = 0): Promise<boolean> {
  try {
    if (ext === "pdf") {
      // No ignoreEncryption: it copies encrypted pages in blank. Failing here shows the note instead.
      const source = await PDFDocument.load(bytes);
      const pages = await pdf.copyPages(source, source.getPageIndices());
      pages.forEach((p) => pdf.addPage(p));
      return pages.length > 0;
    }
    if (ext !== "png" && ext !== "jpg") return false;
    const image = ext === "png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const page = pdf.addPage(A4);
    const fit = image.scaleToFit(A4[0] - MARGIN * 2, A4[1] - MARGIN * 2 - reserve);
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

const STAMP_WIDTH = 340;
const STAMP_ROW = 48;
const STAMP_PAD = 10;
const stampHeight = (rows: number) => STAMP_PAD * 2 + 20 + rows * STAMP_ROW + 22;

/** Makes the page taller and clears the new strip. Nothing here can tell where a
 *  PDF page is blank, and the stamp must never cover the notice. */
function roomBelow(page: PDFPage, height: number): { x: number; y: number } | null {
  const box = page.getCropBox();
  if (page.getRotation().angle % 360 !== 0 || box.width < STAMP_WIDTH + 40) return null;
  page.setMediaBox(box.x, box.y - height, box.width, box.height + height);
  page.setCropBox(box.x, box.y - height, box.width, box.height + height);
  page.drawRectangle({ x: box.x, y: box.y - height, width: box.width, height, color: rgb(1, 1, 1) });
  return { x: box.x + box.width, y: box.y - height };
}

export async function signedNoticePdf(notice: BankScreen, original: Buffer, signatures: NoticeSignature[], slots: SignSlot[]): Promise<Uint8Array> {
  const filled = fillSlots(signatures, slots.map((s) => s.tagId));
  const placed = [...filled.values()];
  const rows = [
    ...slots.map((s) => ({ label: s.label, sig: filled.get(s.tagId) })),
    ...signatures.filter((s) => !placed.includes(s)).map((sig) => ({ label: "Signed", sig })),
  ];
  const height = stampHeight(rows.length);

  const pdf = await PDFDocument.create();
  const included = await addOriginal(pdf, original, notice.ext, height + 10);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pages = pdf.getPages();
  const last = included ? pages[pages.length - 1] : null;
  // A picture was fitted with this room left under it. A turned or narrow PDF page gets the stamp on its own page.
  const spot = last && notice.ext === "pdf" ? roomBelow(last, height + 20) : null;
  const page = last && (spot || notice.ext !== "pdf") ? last : pdf.addPage(A4);
  const right = spot ? spot.x - 20 : A4[0] - MARGIN;
  const bottom = spot ? spot.y + 10 : 30;
  const left = right - STAMP_WIDTH;

  const ink = rgb(0.1, 0.1, 0.1);
  const text = (t: string, x: number, at: number, size: number, f: PDFFont = font) =>
    page.drawText(safe(t).slice(0, 70), { x, y: at, size, font: f, color: ink });
  page.drawRectangle({ x: left, y: bottom, width: STAMP_WIDTH, height, borderColor: ink, borderWidth: 1 });
  let y = bottom + height - STAMP_PAD;
  text("AUTHORISATION", left + STAMP_PAD, y - 11, 11, bold);
  y -= 20;
  // A label is a school's own tag name, so it wraps rather than being cut.
  const labelLines = (label: string) => {
    const lines = [""];
    for (const word of safe(`${label}:`).split(" ")) {
      const next = `${lines[lines.length - 1]} ${word}`.trim();
      if (lines[lines.length - 1] && bold.widthOfTextAtSize(next, 8) > 85) lines.push(word);
      else lines[lines.length - 1] = next;
    }
    return lines.slice(0, 4);
  };
  for (const { label, sig } of rows) {
    labelLines(label).forEach((l, i) => text(l, left + STAMP_PAD, y - 12 - i * 9, 8, bold));
    if (sig) {
      try {
        const mark = await pdf.embedPng(sig.dataUrl);
        const fit = mark.scaleToFit(100, STAMP_ROW - 14);
        page.drawImage(mark, { x: left + 100, y: y - 6 - fit.height, ...fit });
      } catch {
        text("(signature not shown)", left + 100, y - 12, 7);
      }
      text(sig.name.slice(0, 24), left + 205, y - 12, 8, bold);
      text(when(sig.at), left + 205, y - 23, 7);
      const notGreen = sig.checks.filter((c) => c.bank !== "match" || c.amount !== "match").map((c) => c.payee || "?");
      text("Verified with a one-time code", left + 205, y - 32, 6);
      if (sig.override) text(`Not green: ${notGreen.join(", ")}`.slice(0, 40), left + 205, y - 40, 6, bold);
    } else {
      text("Not signed yet", left + 100, y - 12, 8);
    }
    page.drawLine({ start: { x: left + STAMP_PAD, y: y - STAMP_ROW + 2 }, end: { x: right - STAMP_PAD, y: y - STAMP_ROW + 2 }, thickness: 0.3, color: ink });
    y -= STAMP_ROW;
  }
  text(`Signed on School Compliance. File SHA-256 ${notice.hash.slice(0, 32)}`, left + STAMP_PAD, y - 10, 6);
  if (!included) text("This notice could not be copied in. Open the original beside it.", left + STAMP_PAD, y - 18, 6, bold);
  return pdf.save();
}
