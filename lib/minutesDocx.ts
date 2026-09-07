import {
  Document,
  patchDocument,
  PatchType,
  Packer,
  Paragraph,
  TextRun,
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
} from "docx";
import type { SchoolBranding } from "./branding";
import { readableTextOn } from "./brandingColors";
import {
  formatPeriod,
  MEETING_BODY_LABELS,
  SIGNATORY_ROLE_LABELS,
  sectionNumbers,
} from "./minutes";
import { POSITIONS } from "./positions";
import type { MinutesRecord } from "./minutesData";

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

/** Header row, tinted with the school's own colour so the document looks like
 *  the school's rather than the software's. */
function headerRow(branding: SchoolBranding): TableRow {
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
    children: [cell("No.", 700), cell("Item", 7300), cell("Responsible", 2000)],
  });
}

/** One section as a row: number, heading plus body, responsible person. */
function sectionRow(
  number: number | null,
  title: string,
  body: string,
  responsible: string
): TableRow {
  // Each line its own paragraph. A single run containing newlines renders as
  // one unbroken block in Word.
  const lines = (body || "").split(/\r?\n/);
  const bodyParagraphs = lines.every((l) => !l.trim())
    ? [
        new Paragraph({
          children: [
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

  const pad = { top: 80, bottom: 80, left: 100, right: 100 };
  return new TableRow({
    children: [
      new TableCell({
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
        margins: pad,
        children: [
          new Paragraph({
            spacing: { after: 80 },
            children: [new TextRun({ text: title, bold: true, size: 20 })],
          }),
          ...bodyParagraphs,
        ],
      }),
      new TableCell({
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
 * The governing body as a two-column table, for a letterhead's {{governors}}.
 *
 * 🔴 Position order comes from lib/positions, NOT from the register's own
 * order. A governing body table reads Principal, Chair, Deputy - the order the
 * positions are defined in - and sorting it by whoever was captured first
 * would produce a different table every time somebody was added.
 *
 * A vacant seat is drawn as the position with "Vacant" beside it, never
 * skipped: an empty Treasurer line is information a reader of the minutes
 * wants, and a table that silently omits it looks complete when it is not.
 */
export function governorsTable(
  positions: readonly string[],
  holders: Map<string, string[]>,
  /** The school's primary colour, WITH its leading "#". Stripped for docx,
   *  which wants bare hex - doing that at the call site once cost the header
   *  its readable text, because readableTextOn needs the "#" to parse. */
  accent: string
): Table {
  const fill = accent.replace("#", "");
  // 🔴 Derived, not hardcoded white. A yellow-brand school gets near-black
  // header text and a navy one gets white - the same rule the portal's own
  // buttons follow, and the reason Jeppe's yellow does not come out unreadable.
  const headerText = readableTextOn(accent).replace("#", "");

  const pad = { top: 60, bottom: 60, left: 100, right: 100 };
  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: ["Position", "Name"].map(
        (label) =>
          new TableCell({
            margins: pad,
            shading: { type: ShadingType.CLEAR, fill },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: label,
                    bold: true,
                    size: 18,
                    color: headerText,
                  }),
                ],
              }),
            ],
          })
      ),
    }),
  ];

  for (const position of positions) {
    const names = holders.get(position) ?? [];
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            margins: pad,
            children: [
              new Paragraph({
                children: [new TextRun({ text: position, size: 18 })],
              }),
            ],
          }),
          new TableCell({
            margins: pad,
            children: [
              new Paragraph({
                children: [
                  names.length > 0
                    ? // Two people can hold one position - two co-opted
                      // members, a joint deputy - so this is a list, not a
                      // find(). Taking the first would silently drop somebody
                      // off the school's own letterhead.
                      new TextRun({ text: names.join(", "), size: 18 })
                    : new TextRun({
                        text: "Vacant",
                        size: 18,
                        italics: true,
                        color: "999999",
                      }),
                ],
              }),
            ],
          }),
        ],
      })
    );
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
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
  signatures: Map<string, { png: Buffer; width: number; height: number }> = new Map(),
  /**
   * The school's own letterhead .docx, if it has uploaded one.
   *
   * When present the content is PATCHED INTO IT at its {{content}} marker,
   * which keeps everything the school put there: its crest, its wording, its
   * fonts, its governing-body table, and any header or footer it defines. We
   * do not rebuild their letterhead, we fill it in.
   */
  letterhead: Buffer | null = null,
  /**
   * Position -> who holds it now, for a letterhead using {{governors}}.
   *
   * ⚠️ Resolved AT BUILD TIME, so re-downloading last year's minutes shows
   * this year's governing body. Right for letterhead, which describes the
   * school as it stands - and stated plainly on the admin screen, so a school
   * that needs the historical list keeps typing its own table instead.
   *
   * Empty by default: a letterhead with no {{governors}} marker keeps whatever
   * table the school typed, which is every existing letterhead.
   */
  governorsByPosition: Map<string, string[]> = new Map()
): Promise<Buffer> {
  // No people lookup: the responsible name was resolved and FROZEN when the
  // template was copied, so this renders the record rather than today's
  // office holders.
  const children: (Paragraph | Table)[] = [];

  // 🔴 Skipped entirely when a letterhead is in use. Their file already has
  // the crest and the school's name on it, and printing ours underneath
  // theirs is the one outcome nobody wants from uploading a letterhead.
  const ownHeader = !letterhead;

  // Crest, embedded. Sized by height so a wide or tall crest both sit sensibly.
  if (crest && ownHeader) {
    try {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: crest,
              transformation: { width: 80, height: 96 },
              type: "png",
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

  if (ownHeader) children.push(
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
        new TextRun({ text: formatPeriod(record.period), size: 20, color: "666666" }),
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

  // Everything from here is the CONTENT: the numbered table and the
  // signatures. Kept apart from the header above because a school's own
  // letterhead already carries its crest and name, and this is the part that
  // gets patched into it.
  const body: (Paragraph | Table)[] = [];

  const sections = [...record.sections].sort((a, b) => a.order - b.order);
  // The SAME helper the editor uses, so what a school sees while writing is
  // what the document says. Sections before the chosen start point carry no
  // number: the attendee list is not agenda item 1.
  const numbers = sectionNumbers(record.sections);

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
    body.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [700, 7300, 2000],
        rows: [
          headerRow(branding),
          ...sections.map((s) =>
            sectionRow(
              numbers.get(s.id) ?? null,
              s.title,
              s.body,
              s.responsible || ""
            )
          ),
        ],
      })
    );
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
      ...signatureBlock("________________________", "SGB Chair"),
      ...signatureBlock("________________________", "Principal")
    );
  }

  if (letterhead) {
    // patchDocument rewrites the placeholders and leaves every other part of
    // their file untouched, which is why this works at all: we never parse or
    // rebuild their layout.
    //
    // Only `content` is required. The optional ones let a school put the
    // meeting details wherever its own layout wants them, and a letterhead
    // that does not use them simply keeps its own wording.
    const text = (value: string) => ({
      type: PatchType.PARAGRAPH,
      children: [new TextRun(value)],
    });
    return Buffer.from(
      await patchDocument({
        outputType: "nodebuffer",
        data: letterhead,
        patches: {
          content: { type: PatchType.DOCUMENT, children: body },
          title: text(record.title),
          period: text(formatPeriod(record.period)),
          meeting: text(MEETING_BODY_LABELS[record.body]),
          school: text(branding.fullName),
          draft: text(
            record.draftNumber > 0 && !record.signedAt
              ? `DRAFT ${record.draftNumber}`
              : // Blanked rather than left as the raw {{draft}} marker: a signed
                // set of minutes must not go out with template syntax on it.
                ""
          ),
          governors: {
            type: PatchType.DOCUMENT,
            children: [
              governorsTable(POSITIONS, governorsByPosition, branding.colors.primary),
            ],
          },
        },
        // A placeholder the letterhead does not contain is not an error. Most
        // will only use {{content}}.
        keepOriginalStyles: true,
      })
    );
  }

  const doc = new Document({
    creator: branding.fullName,
    title: record.title,
    description: `${MEETING_BODY_LABELS[record.body]} minutes, ${formatPeriod(record.period)}`,
    sections: [
      {
        properties: {},
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `${branding.fullName}  |  ${MEETING_BODY_LABELS[record.body]} minutes  |  ${formatPeriod(record.period)}  |  Page `,
                    size: 16,
                    color: "888888",
                  }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "888888" }),
                  new TextRun({ text: " of ", size: 16, color: "888888" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "888888" }),
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
