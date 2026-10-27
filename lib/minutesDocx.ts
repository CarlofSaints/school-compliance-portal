import {
  Document,
  Packer,
  Paragraph,
  TextRun as DocxTextRun,
  HeadingLevel,
  AlignmentType,
  ImageRun,
  Footer,
  PageNumber,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  TableBorders,
  TableLayoutType,
} from "docx";
import { MAX_WORD_FOOTER_LINES, cleanWordFooter, docxText, type SchoolBranding } from "./branding";
import { readableTextOn } from "./brandingColors";
import {
  formatPeriod,
  minutesWhenLabel,
  MEETING_BODY_LABELS,
  SIGNATORY_ROLE_LABELS,
  sectionListGroups,
  sectionNumbers,
  type AttendeeRow,
  type ListGroup,
} from "./minutes";
import type { MinutesRecord } from "./minutesData";

// Every string of the record and branding is cleaned once at the top of
// buildMinutesDocx, so no field (school name, title, a pasted section body)
// can carry a character that stops Word opening the file.
function docxTextDeep<T>(v: T): T {
  if (typeof v === "string") return docxText(v) as T;
  if (Array.isArray(v)) return v.map(docxTextDeep) as T;
  if (v && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, docxTextDeep(x)])) as T;
  }
  return v;
}

// Backstop: a run built from text that did not come from those two.
class TextRun extends DocxTextRun {
  constructor(options: Exclude<ConstructorParameters<typeof DocxTextRun>[0], string>) {
    super(options.text === undefined ? options : { ...options, text: docxText(options.text) });
  }
}

// ---------------------------------------------------------------------------
// Minutes as an editable Word document.
//
// Carl: "add an option to download the final draft to MS Word so those who
// prefer a wet ink signature can sign and then upload".
//
// So this is not a preview. It is the document a school prints, signs by hand
// and scans back in, which means it must carry the school's crest, its name in
// the footer, and real signature lines with room to write.
//
// Built with the `docx` package rather than HTML converted by Word.
// 🔴 Word's HTML import LINKS images instead of embedding them, so the file
// looks right on the machine that made it and shows a red X everywhere else.
// Building the OOXML directly embeds the crest as bytes, which is the only way
// this survives being emailed to a Principal.
// ---------------------------------------------------------------------------

/** Every footer run: small and grey. */
const FOOTER_RUN = { size: 16, color: "888888" } as const;

/** Wide enough to write a signature on, in twips (1/20 pt). ~7cm. */
const SIGNATURE_LINE_WIDTH = 4000;

function spacer(after = 200): Paragraph {
  return new Paragraph({ text: "", spacing: { after } });
}

/** A ruled line to sign on, with the role underneath it. */
function signatureBlock(name: string, role: string): Paragraph[] {
  return [
    new Paragraph({
      text: "",
      spacing: { before: 400, after: 0 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 1 },
      },
      indent: { right: 20000 - SIGNATURE_LINE_WIDTH },
    }),
    new Paragraph({
      spacing: { before: 40, after: 240 },
      children: [
        new TextRun({ text: name, bold: true, size: 20 }),
        new TextRun({ text: `    ${role}`, size: 18, color: "666666" }),
        new TextRun({ text: "        Date: ", size: 18, color: "666666" }),
        new TextRun({ text: "________________", size: 18, color: "999999" }),
      ],
    }),
  ];
}

// ---------------------------------------------------------------------------
// Widths, in twips. 🔴 Every table is sized from the page. The minutes table
// used to be "100%" with columns adding up to 10 000, wider than the page:
// Word squeezed the columns its own way, the attendance list inside the Item
// cell kept its full width and ran off the edge, and "Responsible" wrapped a
// few letters per line.
// ---------------------------------------------------------------------------

/** The page every minutes document is set to (see the section properties):
 *  A4 with 1" margins. */
const DEFAULT_CONTENT_WIDTH = 11906 - 2 * 1440;

interface Columns {
  total: number;
  no: number;
  item: number;
  responsible: number;
}

/** No. narrow, Responsible wide enough for its own heading, Item the rest. */
export function minutesColumns(total: number): Columns {
  const no = Math.max(500, Math.round(total * 0.07));
  const responsible = Math.max(1500, Math.round(total * 0.2));
  return { total, no, item: total - no - responsible, responsible };
}

/** Cell padding left + right in the minutes table. */
const CELL_PAD_X = 200;

/**
 * What Word needs to embed a crest: its real format and shape. The upload
 * accepts JPEG, WebP and SVG too, and a JPEG labelled "png" is a broken image
 * in Word. WebP and SVG are not embeddable this way, so they are left out.
 */
export function crestImage(b: Buffer): { type: "png" | "jpg" | "gif" | "bmp"; width: number; height: number } | null {
  const ok = (type: "png" | "jpg" | "gif" | "bmp", width: number, height: number) =>
    width > 0 && height > 0 ? { type, width, height } : null;
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return ok("png", b.readUInt32BE(16), b.readUInt32BE(20));
  if (b.length > 10 && b.toString("ascii", 0, 4) === "GIF8") return ok("gif", b.readUInt16LE(6), b.readUInt16LE(8));
  if (b.length > 26 && b.toString("ascii", 0, 2) === "BM") return ok("bmp", b.readInt32LE(18), Math.abs(b.readInt32LE(22)));
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    // Walk the JPEG markers to the frame header, which holds the size.
    for (let i = 2; i + 9 < b.length; ) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return ok("jpg", b.readUInt16BE(i + 7), b.readUInt16BE(i + 5));
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

/** Header row, tinted with the school's own colour so the document looks like
 *  the school's rather than the software's. */
function headerRow(branding: SchoolBranding, cols: Columns): TableRow {
  const cell = (text: string, width: number) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      shading: {
        type: ShadingType.CLEAR,
        fill: branding.colors.primary.replace("#", ""),
      },
      children: [
        new Paragraph({
          spacing: { before: 60, after: 60 },
          children: [
            new TextRun({
              text,
              bold: true,
              size: 18,
              // White or near-black, whichever actually reads on the school's
              // colour. A yellow-branded school would otherwise get white on
              // yellow, which is invisible on paper.
              color: readableTextOn(branding.colors.primary).replace("#", ""),
            }),
          ],
        }),
      ],
    });

  return new TableRow({
    tableHeader: true, // repeats the header when the table breaks across pages
    children: [cell("No.", cols.no), cell("Item", cols.item), cell("Responsible", cols.responsible)],
  });
}

/** One section as a row: number, heading plus body, responsible person. */
function sectionRow(
  number: number | null,
  title: string,
  body: string,
  responsible: string,
  /** The lists this section draws (sectionListGroups): an attendance list,
   *  or the Apologies section's two. Empty for a text section. */
  groups: ListGroup[],
  cols: Columns
): TableRow {
  const hasRows = groups.length > 0;
  // Each line its own paragraph. A single run containing newlines renders as
  // one unbroken block in Word.
  const lines = (body || "").split(/\r?\n/);
  const bodyParagraphs = lines.every((l) => !l.trim())
    ? [
        new Paragraph({
          children: hasRows
            ? // 🔴 Still a paragraph, never nothing. Word requires a cell to END
              // with a paragraph, and a cell ending on the attendance table is
              // a file Word reports as corrupt.
              []
            : [
                new TextRun({ text: "Nothing recorded.", italics: true, color: "999999", size: 18 }),
              ],
        }),
      ]
    : lines.map(
        (line) =>
          new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text: line, size: 20 })],
          })
      );

  const pad = { top: 80, bottom: 80, left: CELL_PAD_X / 2, right: CELL_PAD_X / 2 };
  return new TableRow({
    children: [
      new TableCell({
        width: { size: cols.no, type: WidthType.DXA },
        margins: pad,
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: number === null ? "" : String(number), bold: true, size: 20 }),
            ],
          }),
        ],
      }),
      new TableCell({
        width: { size: cols.item, type: WidthType.DXA },
        margins: pad,
        children: [
          new Paragraph({
            spacing: { after: 80 },
            children: [new TextRun({ text: title, bold: true, size: 20 })],
          }),
          // Exactly the Item column less its padding, so it cannot run over.
          ...listGroupBlocks(groups, { indent: 0, width: cols.item - CELL_PAD_X }),
          ...bodyParagraphs,
        ],
      }),
      new TableCell({
        width: { size: cols.responsible, type: WidthType.DXA },
        margins: pad,
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: responsible,
                size: 18,
                color: "444444",
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

/**
 * An attendance list: position and name in two lined-up columns, no borders.
 *
 * Carl's own letterhead lists the governing body this way, and typed spaces
 * cannot reproduce it: Word draws text in a proportional font, so spaces land
 * in a different place on every line. A borderless table is what Word itself
 * uses for this.
 */
function attendanceTable(
  rows: AttendeeRow[],
  opts: { indent: number; width: number }
): Table {
  const col = Math.floor(opts.width / 2);
  const cell = (text: string) =>
    new TableCell({
      width: { size: col, type: WidthType.DXA },
      margins: { top: 0, bottom: 0, left: 60, right: 60 },
      children: [new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text })] })],
    });
  return new Table({
    width: { size: opts.width, type: WidthType.DXA },
    columnWidths: [col, col],
    layout: TableLayoutType.FIXED,
    ...(opts.indent ? { indent: { size: opts.indent, type: WidthType.DXA } } : {}),
    borders: TableBorders.NONE,
    rows: rows.map(
      (r) => new TableRow({ children: [cell(r.position), cell(r.name)] })
    ),
  });
}

/**
 * The lists a section draws, as Word content: each group's sub-heading ("Not in
 * Attendance"), then its two-column table, or its "None." when it is empty.
 *
 * The groups come from sectionListGroups in lib/minutes, the same helper the
 * editor and the sign page use, so the Word file cannot list different people.
 */
function listGroupBlocks(
  groups: ListGroup[],
  opts: { indent: number; width: number }
): (Paragraph | Table)[] {
  const indent = opts.indent ? { left: opts.indent } : undefined;
  const out: (Paragraph | Table)[] = [];
  for (const g of groups) {
    if (g.heading) {
      out.push(
        new Paragraph({
          spacing: { before: 160, after: 60 },
          indent,
          children: [new TextRun({ text: g.heading, bold: true })],
        })
      );
    }
    if (g.rows.length > 0) {
      out.push(attendanceTable(g.rows, opts));
    } else if (g.emptyText) {
      out.push(
        new Paragraph({
          spacing: { after: 60 },
          indent,
          children: [new TextRun({ text: g.emptyText, italics: true, color: "666666" })],
        })
      );
    }
  }
  return out;
}

/**
 * A section that comes BEFORE numbering starts, drawn above the numbered table
 * rather than as a blank-numbered row inside it.
 *
 * Carl: the attendees are not agenda item 1. On his letterhead the governing
 * body sits under its own bold heading at the top, and the numbered items
 * follow. Minutes with no "start numbering here" have no such sections, so
 * their layout is exactly as before.
 */
function leadingSection(
  title: string,
  body: string,
  groups: ListGroup[],
  contentWidth: number
): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    new Paragraph({
      spacing: { before: 120, after: 80 },
      children: [new TextRun({ text: title, bold: true, size: 24 })],
    }),
  ];
  // Indented ~1.25cm under the heading, as on the letterhead.
  out.push(...listGroupBlocks(groups, { indent: 720, width: contentWidth - 720 }));
  const lines = (body || "").split(/\r?\n/);
  if (lines.some((l) => l.trim())) {
    out.push(
      ...lines.map(
        (line) =>
          new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: line })] })
      )
    );
  }
  out.push(spacer(240));
  return out;
}

export async function buildMinutesDocx(
  record: MinutesRecord,
  branding: SchoolBranding,
  crest: Buffer | null,
  /**
   * The mark each signatory drew or typed, by lowercased email.
   *
   * Optional and tolerant of gaps: a download must not fail because one
   * signature image could not be read. A missing one falls back to the
   * wording, which still records that they signed.
   */
  signatures: Map<string, { png: Buffer; width: number; height: number }> = new Map()
): Promise<Buffer> {
  // No people lookup: the responsible name was resolved and FROZEN when the
  // template was copied, so this renders the record rather than today's
  // office holders.
  const footerText = cleanWordFooter(branding.wordFooter ?? "");
  record = docxTextDeep(record);
  branding = docxTextDeep(branding);
  const children: (Paragraph | Table)[] = [];


  // Crest, embedded. Sized by height so a wide or tall crest both sit sensibly.
  const crestInfo = crest ? crestImage(crest) : null;
  if (crest && !crestInfo) console.warn("[minutes docx] Crest is not PNG, JPEG, GIF or BMP; left out.");
  if (crest && crestInfo) {
    try {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: crest,
              transformation: {
                width: Math.min(200, Math.round((96 * crestInfo.width) / crestInfo.height)),
                height: 96,
              },
              type: crestInfo.type,
            }),
          ],
        })
      );
    } catch {
      // A crest that cannot be decoded must not lose the whole document. The
      // minutes matter; the picture does not.
      console.warn("[minutes docx] Could not embed the crest.");
    }
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 0 },
      children: [new TextRun({ text: branding.fullName, bold: true, size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 320 },
      children: [
        new TextRun({
          text: `${MEETING_BODY_LABELS[record.body]} meeting minutes`,
          size: 22,
          color: "666666",
        }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 80 },
      children: [new TextRun({ text: record.title, bold: true, size: 26 })],
    }),
    new Paragraph({
      spacing: { after: 320 },
      children: [
        new TextRun({ text: minutesWhenLabel(record), size: 20, color: "666666" }),
        ...(record.draftNumber > 0 && !record.signedAt
          ? [
              new TextRun({
                text: `          DRAFT ${record.draftNumber}`,
                bold: true,
                size: 20,
                color: "B45309",
              }),
            ]
          : []),
      ],
    })
  );

  // Everything from here is the CONTENT: the numbered table and the signatures.
  const body: (Paragraph | Table)[] = [];

  const sections = [...record.sections].sort((a, b) => a.order - b.order);
  // The SAME helper the editor uses, so what a school sees while writing is
  // what the document says. Sections before the chosen start point carry no
  // number: the attendee list is not agenda item 1.
  const numbers = sectionNumbers(record.sections);
  const cols = minutesColumns(DEFAULT_CONTENT_WIDTH);

  if (sections.length === 0) {
    body.push(
      new Paragraph({
        children: [
          new TextRun({
            text: record.original?.filename
              ? `These minutes were uploaded as ${record.original.filename}.`
              : "No sections have been written yet.",
            italics: true,
            color: "666666",
          }),
        ],
      })
    );
  } else {
    // 🔴 A three column table: number, content, person responsible.
    //
    // Carl: "the minutes typically live in a table in Word with the number in
    // column 1, the content in column 2 and the person responsible in column
    // 3". This is the shape a school already recognises, so the document does
    // not have to be reformatted before it goes to the DoE.
    //
    // Sections before numbering starts (the attendance list) go ABOVE the
    // table as plain content; see leadingSection. With no start point set,
    // every section is numbered and this is the table it always was.
    const leading = sections.filter((s) => numbers.get(s.id) == null);
    const numbered = sections.filter((s) => numbers.get(s.id) != null);

    for (const s of leading) {
      body.push(...leadingSection(s.title, s.body, sectionListGroups(s, sections), cols.total));
    }

    if (numbered.length > 0) {
      body.push(
        new Table({
          width: { size: cols.total, type: WidthType.DXA },
          columnWidths: [cols.no, cols.item, cols.responsible],
          layout: TableLayoutType.FIXED,
          rows: [
            headerRow(branding, cols),
            ...numbered.map((s) =>
              sectionRow(
                numbers.get(s.id) ?? null,
                s.title,
                s.body,
                s.responsible || "",
                sectionListGroups(s, sections),
                cols
              )
            ),
          ],
        })
      );
    }
  }
  // Signatures. Present whether or not anybody has signed in the app, because
  // this file exists precisely so it can be signed by hand.
  body.push(
    spacer(400),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 320, after: 120 },
      children: [new TextRun({ text: "Signatures", bold: true, size: 22 })],
    })
  );

  if (record.signatories.length > 0) {
    for (const s of record.signatories) {
      if (s.signedAt) {
        // Already signed in the app. Recorded as fact, not as a line to sign
        // again, or the same person could end up signing twice by two routes.

        // The mark they actually made, above their name, which is what a
        // reader of minutes expects to see. Scaled to a fixed height with the
        // width following the image's own ratio: a wide signature squeezed
        // into a square box does not look like anybody's signature.
        const mark = signatures.get(s.email.trim().toLowerCase());
        if (mark) {
          try {
            const h = 44;
            const w = Math.max(40, Math.min(260, Math.round((mark.width / mark.height) * h)));
            body.push(
              new Paragraph({
                spacing: { before: 240, after: 0 },
                children: [
                  new ImageRun({
                    type: "png",
                    data: mark.png,
                    transformation: { width: w, height: h },
                  }),
                ],
              })
            );
          } catch {
            // A mark that cannot be embedded must not lose the document. The
            // wording below still records that this person signed.
            console.warn("[minutes docx] Could not embed a signature.");
          }
        }

        body.push(
          new Paragraph({
            spacing: { before: mark ? 0 : 240, after: 240 },
            children: [
              new TextRun({ text: s.name, bold: true, size: 20 }),
              new TextRun({
                text: `    ${SIGNATORY_ROLE_LABELS[s.role]}`,
                size: 18,
                color: "666666",
              }),
              new TextRun({
                text: `\n        Signed electronically on ${new Date(
                  s.signedAt
                ).toLocaleDateString("en-ZA", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}`,
                size: 16,
                color: "059669",
                break: 1,
              }),
              ...(s.documentHash
                ? [
                    new TextRun({
                      // The hash is printed so a paper copy carries its own
                      // proof: it can be checked against the stored record
                      // years later, which is the whole point of keeping it.
                      text: `        Document reference: ${s.documentHash.slice(0, 16)}`,
                      size: 14,
                      color: "999999",
                      break: 1,
                    }),
                  ]
                : []),
            ],
          })
        );
      } else {
        body.push(...signatureBlock(s.name, SIGNATORY_ROLE_LABELS[s.role]));
      }
    }
  } else {
    // No signatories set yet, so give the two the DoE requires by default.
    body.push(
      ...signatureBlock("________________________", "Chairperson"),
      ...signatureBlock("________________________", "Principal")
    );
  }

  const doc = new Document({
    creator: branding.fullName,
    title: record.title,
    description: `${MEETING_BODY_LABELS[record.body]} minutes, ${formatPeriod(record.period)}`,
    sections: [
      {
        // Set, not left to docx's default, because DEFAULT_CONTENT_WIDTH is
        // worked out from exactly this page and these margins.
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              // The school's own footer text (directors, address), one run per
              // line so its line breaks survive. Cleaned once, by
              // cleanWordFooter above, so these runs skip the backstop.
              ...(footerText
                ? [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { after: 60 },
                      children: footerText.split("\n").slice(0, MAX_WORD_FOOTER_LINES).map(
                        (line, i) => new DocxTextRun({ ...FOOTER_RUN, text: line, break: i ? 1 : undefined })
                      ),
                    }),
                  ]
                : []),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    ...FOOTER_RUN,
                    text: `${branding.fullName}  |  ${MEETING_BODY_LABELS[record.body]} minutes  |  ${minutesWhenLabel(record)}  |  Page `,
                  }),
                  new TextRun({ ...FOOTER_RUN, children: [PageNumber.CURRENT] }),
                  new TextRun({ ...FOOTER_RUN, text: " of " }),
                  new TextRun({ ...FOOTER_RUN, children: [PageNumber.TOTAL_PAGES] }),
                ],
              }),
            ],
          }),
        },
        children: [...children, ...body],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
