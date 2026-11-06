import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { addOriginal } from "./paymentSignedPdf";
import { decodeSignature } from "./minutesSigning";
import {
  ACTIVITIES,
  BENEFITS,
  PAYS,
  TIMES,
  WILLINGNESS,
  chairSigned,
  employeeSigned,
  employeeUndertaking,
  sgbUndertaking,
  yearMax,
  type Chair,
  type Entry,
  type Signature,
  type Year,
} from "./section38a";

// ---------------------------------------------------------------------------
// The application pack: a checklist, then Form 1 Parts A and B for each person,
// then the policy. Built when asked for, so a new signature appears without
// anything being re-saved. It carries only signatures that still count, so it
// doubles as the preview. The form's headings and undertakings are word for word.
// ---------------------------------------------------------------------------

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;
const WIDTH = A4[0] - MARGIN * 2;

// The built-in PDF font takes Latin-1 only, and throws on anything else.
const safe = (s: string) => s.replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
const rand = (n: number) => `R ${n.toFixed(2)}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "long" });

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of safe(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  return line ? [...lines, line] : lines;
}

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(readonly pdf: PDFDocument, readonly font: PDFFont, readonly bold: PDFFont) {
    this.newPage();
  }
  newPage() {
    this.page = this.pdf.addPage(A4);
    this.y = A4[1] - MARGIN;
  }
  text(text: string, { size = 10, f = this.font, gap = 6, indent = 0 }: { size?: number; f?: PDFFont; gap?: number; indent?: number } = {}) {
    for (const line of wrap(text, f, size, WIDTH - indent)) {
      if (this.y < MARGIN + size + 4) this.newPage();
      this.page.drawText(line, { x: MARGIN + indent, y: this.y - size, size, font: f, color: rgb(0.1, 0.1, 0.1) });
      this.y -= size + 3;
    }
    this.y -= gap;
  }
  field(label: string, value: string) {
    this.text(`${label}: ${value || "-"}`);
  }
  mark(label: string, image: PDFImage | null, who: string) {
    if (this.y < MARGIN + 80) this.newPage();
    if (image) {
      const fit = image.scaleToFit(180, 48);
      this.page.drawImage(image, { x: MARGIN, y: this.y - fit.height, ...fit });
    }
    this.y -= 52;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + 240, y: this.y }, thickness: 0.5, color: rgb(0.4, 0.4, 0.4) });
    this.y -= 4;
    this.text(`${label}${who ? `: ${who}` : ""}`, { size: 9 });
  }
}

const yesNo = (ok: boolean) => (ok ? "Yes" : "No");

function partA(w: Writer, y: Year, e: Entry, school: string) {
  w.text("FORM 1 PART A", { size: 13, f: w.bold, gap: 2 });
  w.text("APPLICATION FORM IN TERMS OF SECTION 38A OF THE SOUTH AFRICAN SCHOOLS ACT, 1996 (Act No. 84 of 1996) BY THE SCHOOL GOVERNING BODY (SGB)", { f: w.bold });
  w.text(`ACADEMIC YEAR 01 JANUARY ${y.year} TO 31 DECEMBER ${y.year}`, { f: w.bold, gap: 10 });
  w.text("1. Details of the school", { f: w.bold });
  w.field("1.1 District", y.district);
  w.field("1.2 Name of school", school);
  w.field("1.3 School EMIS number", y.emis);
  w.text("2. Details of the State Employee", { f: w.bold });
  w.field("2.1 Surname", e.surname);
  w.field("2.2 First Names", e.name);
  w.field("2.3 PERSAL number", e.persal);
  w.field("2.4 Rank", e.rank);
  w.text("3. Give the nature of the service/activity/activities to be rendered by state employee to be paid the additional remuneration or benefits:", { f: w.bold });
  w.text(e.description);
  w.text("4. The nature/type of the proposed remuneration/benefit:", { f: w.bold });
  w.text(BENEFITS[e.benefit]);
  w.text("5. The amount proposed to be remunerated or nature of benefit:", { f: w.bold });
  w.text(`${rand(e.amount)} ${PAYS[e.pay].toLowerCase()}, ${rand(yearMax(e))} maximum for the year`);
  w.text("6. Give full details of the extent of such payment to the state employee.", { f: w.bold });
  w.text(e.details || "-");
  w.text("7. When will the remuneration be paid?", { f: w.bold });
  w.text(PAYS[e.pay]);
  w.text("8. Confirmation that school funds, other than NNSSF, will be used to remunerate the state employee.", { f: w.bold });
  w.text(yesNo(y.approval.funds));
  w.text("9. Confirmation of compliance in terms of Section 20 (5) - (9) of SASA with regard to additional staff employed by the SGB.", { f: w.bold });
  w.text(yesNo(y.approval.sections20));
  w.text("10. Confirmation that the SGB has budgeted for this section 38A expenditure (including taxes) and has calculated the reasonable monetary value of any benefit.", { f: w.bold });
  w.text(yesNo(y.budgetLine > 0));
}

function undertaking(w: Writer, u: { intro: string; points: string[] }) {
  w.text(u.intro);
  u.points.forEach((p, i) => w.text(`${i + 1}. ${p}`));
}

export async function section38aPack(y: Year, school: string, policy: { name: string; bytes: Buffer | null }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(pdf, font, bold);
  const image = async (s?: Signature, counts = false) => (s && counts ? pdf.embedPng(decodeSignature(s.dataUrl).png) : null);
  const chair = async (c?: Chair) => ({ image: await image(c?.signature, chairSigned(y, c)), name: chairSigned(y, c) ? c!.signature!.name : "", on: chairSigned(y, c) ? day(c!.signature!.at) : "" });
  const [sgb, finance] = await Promise.all([chair(y.chairs.sgb), chair(y.chairs.finance)]);

  w.text(`Section 38A application, ${y.year} budget year`, { size: 16, f: bold, gap: 4 });
  w.text(school, { size: 12, gap: 12 });
  w.text("This pack uses the DRAFT national Form 1 (Government Notice 7796, Gazette 55155, 6 August 2026). Confirm with your district that it is accepted before you lodge it.", { f: bold, gap: 12 });
  w.text("In this pack", { f: bold });
  for (const e of y.people) w.text(`${e.name} ${e.surname}: Form 1 Parts A and B, ${employeeSigned(y, e) ? "signed by the employee" : "NOT signed by the employee"}`, { indent: 10, gap: 2 });
  w.text(`Undertaking by the SGB: ${sgb.name ? "signed" : "NOT signed"} by the SGB chairperson, ${finance.name ? "signed" : "NOT signed"} by the finance committee chairperson`, { indent: 10, gap: 2 });
  w.text(`Section 38A policy: ${policy.name || "NOT chosen"}${policy.name && !policy.bytes ? " (attach this by hand, it is not a PDF under 3 MB)" : ""}`, { indent: 10, gap: 12 });
  w.text("Lodge at least four months before the budget is finalised (section 38A(4)) and keep proof of the date.");

  for (const e of y.people) {
    const counts = employeeSigned(y, e);
    w.newPage();
    partA(w, y, e, school);

    w.newPage();
    w.text("UNDERTAKING BY SCHOOL GOVERNING BODY", { size: 13, f: bold, gap: 8 });
    undertaking(w, sgbUndertaking(school, `${e.name} ${e.surname}`));
    w.y -= 10;
    w.mark("Chairperson: SGB", sgb.image, sgb.name);
    w.mark("Chairperson: Finance Committee", finance.image, finance.name);
    w.text(`Signed at ${school} on ${sgb.on || "____________"}`);

    w.newPage();
    w.text("FORM 1 PART B", { size: 13, f: bold, gap: 2 });
    w.text("APPLICATION FORM IN TERMS OF SECTION 33 OF THE EMPLOYMENT OF EDUCATORS ACT, 1998 (ACT NO. 76 OF 1998) OR SECTION 30 OF THE PUBLIC SERVICE ACT, 1994 (PROCLAMATION NO. 103 OF 1994)", { f: bold });
    w.text(`ACADEMIC YEAR JANUARY ${y.year} TO 31 DECEMBER ${y.year}`, { f: bold, gap: 10 });
    w.field("1. Application for", BENEFITS[e.benefit]);
    w.field("2.1 Types of activities", e.activities.map((a) => ACTIVITIES[a]).join(", "));
    w.field("2.2 Brief description of the activities", e.description);
    w.field("3.1 Time expended on activity/ies", e.times.map((t) => TIMES[t]).join(", "));
    if (e.timesOther) w.field("3.2 Other", e.timesOther);
    w.field("4. Cost", PAYS[e.pay]);
    w.field("4.1 Amount", `${rand(e.amount)}${e.pay === "hourly" ? ` for ${e.hours} hours in the year` : ""}`);
    w.field("4.2 Total maximum amount for the year", rand(yearMax(e)));
    w.y -= 8;
    w.text("Undertaking by the Educator/Public Service Employee", { f: bold });
    undertaking(w, employeeUndertaking(y, e, school));
    w.text(WILLINGNESS);
    w.y -= 8;
    w.mark("SIGNATURE OF THE EMPLOYEE", await image(e.signature, counts), counts ? `${e.signature!.name}, ${day(e.signature!.at)}` : "");
  }

  // shortcut: the policy is appended whole; a locked PDF is left out and the checklist line above still names it.
  if (policy.bytes) await addOriginal(pdf, policy.bytes, "pdf");
  return pdf.save();
}
