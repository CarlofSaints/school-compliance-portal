import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  PageBreak,
} from "docx";
import { writeFileSync } from "fs";

// ---------------------------------------------------------------------------
// The explainer voiceover, as a Word document Carl can actually open.
//
// Carl: "i cannot open the script. can you put it in a word doc or is there a
// reason it needs to be in mD?"
//
// There was no reason. Markdown was my default, not a requirement, and the one
// person who has to READ THIS ALOUD could not open it.
//
// So it is set for reading rather than for reviewing: 16pt, generous line
// spacing, one block per section with its timing beside it, and the recording
// notes on their own page so they are not in the way once he starts. The blocks
// are what he reads; everything else is instruction and is visibly not part of
// the script.
//
//   npx tsx scripts/build-video-script-docx.ts
// ---------------------------------------------------------------------------

const OUT = "C:/Users/CarlDosSantos-(OUTER/Projects/school-compliance-video/SCRIPT.docx";

const BLOCKS: { n: number; title: string; at: string; lines: string[] }[] = [
  {
    n: 1,
    title: "Hook, the problem",
    at: "0:00, about 12 seconds",
    lines: [
      "Every school governing body in the country loses the same four things.",
      "The policy nobody can find. The quote nobody approved. The minutes nobody signed. And the thing everybody agreed to do, that nobody did.",
    ],
  },
  {
    n: 2,
    title: "What it is",
    at: "0:12, about 14 seconds",
    lines: [
      "School Compliance is a private governance portal for your school. Your own web address, your crest, your colours, and your data kept completely separate from every other school on it.",
    ],
  },
  {
    n: 3,
    title: "Policy compliance",
    at: "0:26, about 18 seconds",
    lines: [
      "Keep every governance policy in one place, with its full version history. Then upload one and get a compliance score against the BELA Act, SASA and your provincial regulations, with the gaps listed one by one.",
      "Not a filing cabinet. An audit you can run on a Tuesday afternoon.",
    ],
  },
  {
    n: 4,
    title: "Funding applications",
    at: "0:44, about 16 seconds",
    lines: [
      "Every funding application in one place, with its quotes attached, routed to the right approvers by the amount. Under five thousand it is simply logged. Over ten it goes to the finance committee. You set the rules once.",
    ],
  },
  {
    n: 5,
    title: "Meeting minutes",
    at: "1:00, about 24 seconds",
    lines: [
      "Write your minutes in the portal, or upload the ones you already have. Send the draft to the Chair and the Principal to check. When they approve it, everyone who has to sign gets their own one time code, opens the document, reads it, and signs it right there in the browser.",
      "It comes out on your school's own letterhead. And the moment the last signature lands, the whole governing body gets a copy.",
    ],
  },
  {
    n: 6,
    title: "Action items",
    at: "1:24, about 16 seconds",
    lines: [
      "Anything the meeting agreed becomes an action, raised straight off the minute that agreed it, with an owner and a date. The portal chases them by email, so nobody arrives at the next meeting asking what happened to March.",
    ],
  },
  {
    n: 7,
    title: "Call to action",
    at: "1:40, about 12 seconds",
    lines: [
      "One thousand seven hundred and fifty rand a month, for your whole governing body. Forty percent of that goes back to a school that needs it.",
      "School compliance dot co dot za.",
    ],
  },
];

const HOW = [
  "Somewhere soft. A room with curtains, a carpet and a closed door beats any microphone. A car with the engine off is genuinely excellent.",
  "Your phone's voice memo app is fine. Hold it about a hand's width away and slightly off to the side, so your breath does not hit it straight on.",
  "Read it slower than feels natural. Everybody reads faster than they think. If it feels a touch slow to you, it is probably right.",
  "Leave a full second of silence between blocks. That gives a clean cut and lets each scene land.",
  "Fluff a line? Stop, breathe, and say the whole sentence again. Do not start the file over. The good take will be kept.",
  "Save the recording as voiceover.mp3 and tell Claude when it is done.",
];

const heading = (text: string, size = 32) =>
  new Paragraph({
    spacing: { before: 240, after: 160 },
    children: [new TextRun({ text, bold: true, size, font: "Calibri" })],
  });

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 24 } },
    },
  },
  sections: [
    {
      properties: {},
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [
            new TextRun({ text: "School Compliance", bold: true, size: 44 }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [
            new TextRun({
              text: "Explainer video   ·   voiceover script",
              size: 24,
              color: "666666",
            }),
          ],
        }),
        new Paragraph({
          spacing: { after: 300 },
          children: [
            new TextRun({
              text: "About 265 words, roughly one minute fifty at a natural pace. Everything on screen is timed to your recording, so this is the first thing that has to exist.",
              size: 24,
              italics: true,
            }),
          ],
        }),

        heading("How to record it"),
        ...HOW.map(
          (t, i) =>
            new Paragraph({
              spacing: { after: 160, line: 300 },
              children: [
                new TextRun({ text: `${i + 1}.  `, bold: true, size: 24 }),
                new TextRun({ text: t, size: 24 }),
              ],
            })
        ),

        new Paragraph({ children: [new PageBreak()] }),

        new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: "The script", bold: true, size: 40 })],
        }),
        new Paragraph({
          spacing: { after: 360 },
          children: [
            new TextRun({
              text: "Read only the large text. The grey headings are for reference and are not spoken.",
              size: 22,
              color: "666666",
              italics: true,
            }),
          ],
        }),

        ...BLOCKS.flatMap((b) => [
          new Paragraph({
            spacing: { before: 360, after: 60 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: "DDDDDD" },
            },
            children: [
              new TextRun({
                text: `${b.n}.  ${b.title}`,
                bold: true,
                size: 22,
                color: "888888",
              }),
              new TextRun({
                text: `        ${b.at}`,
                size: 20,
                color: "AAAAAA",
              }),
            ],
          }),
          // 🔴 The spoken lines are 32 half-points (16pt) with 1.5 line spacing.
          // This is the only part he reads off the screen while talking, and
          // body text at 11pt is what makes somebody lean in and lose their
          // place mid-sentence.
          ...b.lines.map(
            (line) =>
              new Paragraph({
                spacing: { before: 160, after: 160, line: 360 },
                children: [new TextRun({ text: line, size: 32 })],
              })
          ),
        ]),

        new Paragraph({ children: [new PageBreak()] }),
        heading("A few notes on the wording"),
        ...[
          'The amount and the web address are written out in words because that is how you will say them. Reading "R1 750" aloud tends to come out as "R one seven five zero".',
          "The hook names four losses and the film answers them in the same order: policy, funding, minutes, actions. If a scene moves, the hook has to move with it.",
          "No module names are spoken. A principal does not care that there is an action item register; they care that the thing agreed in March actually gets done. The module names appear on screen instead.",
          "Nothing claims the portal makes a school compliant. It surfaces gaps against the legislation. Promising more is a promise that gets tested in a real audit.",
          "No school is named. HVPS and Jeppe are real clients and their governance is their own business.",
        ].map(
          (t) =>
            new Paragraph({
              spacing: { after: 160, line: 300 },
              bullet: { level: 0 },
              children: [new TextRun({ text: t, size: 24 })],
            })
        ),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  writeFileSync(OUT, buf);
  console.log(`Wrote ${OUT} (${(buf.length / 1024).toFixed(0)} kB)`);
});
