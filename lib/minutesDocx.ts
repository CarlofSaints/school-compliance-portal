import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  ImageRun,
  Footer,
  PageNumber,
  BorderStyle,
} from "docx";
import type { SchoolBranding } from "./branding";
import { formatPeriod, MEETING_BODY_LABELS, SIGNATORY_ROLE_LABELS } from "./minutes";
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

export async function buildMinutesDocx(
  record: MinutesRecord,
  branding: SchoolBranding,
  crest: Buffer | null
): Promise<Buffer> {
  const children: Paragraph[] = [];

  // Crest, embedded. Sized by height so a wide or tall crest both sit sensibly.
  if (crest) {
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

  const sections = [...record.sections].sort((a, b) => a.order - b.order);
  if (sections.length === 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text:
              record.original?.filename
                ? `These minutes were uploaded as ${record.original.filename}.`
                : "No sections have been written yet.",
            italics: true,
            color: "666666",
          }),
        ],
      })
    );
  }

  for (const s of sections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 100 },
        children: [new TextRun({ text: s.title, bold: true, size: 22 })],
      })
    );
    // Each line becomes its own paragraph. A single run with newlines in it
    // renders as one unbroken block in Word.
    const lines = (s.body || "").split(/\r?\n/);
    if (lines.every((l) => !l.trim())) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Nothing recorded.", italics: true, color: "999999" }),
          ],
        })
      );
    } else {
      for (const line of lines) {
        children.push(
          new Paragraph({
            spacing: { after: 80 },
            children: [new TextRun({ text: line, size: 20 })],
          })
        );
      }
    }
  }

  // Signatures. Present whether or not anybody has signed in the app, because
  // this file exists precisely so it can be signed by hand.
  children.push(
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
        children.push(
          new Paragraph({
            spacing: { before: 240, after: 240 },
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
        children.push(...signatureBlock(s.name, SIGNATORY_ROLE_LABELS[s.role]));
      }
    }
  } else {
    // No signatories set yet, so give the two the DoE requires by default.
    children.push(
      ...signatureBlock("________________________", "SGB Chair"),
      ...signatureBlock("________________________", "Principal")
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
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
