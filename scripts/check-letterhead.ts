// Minutes built INTO a school's own Word letterhead.
//
//   npx tsx scripts/check-letterhead.ts [path/to/a/real/letterhead.docx]
//
// 🔴 The promise this feature makes is "your letterhead, unchanged, with the
// minutes inside it". So the checks are almost entirely about what SURVIVES:
// the crest, the fonts, the wording, the governing-body table. We never parse
// or rebuild their layout, we fill in one marker.

import { writeFileSync, existsSync } from "fs";
import zlib from "zlib";
import AdmZip from "adm-zip";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Header,
  Footer,
  ImageRun,
  patchDetector,
} from "docx";
import { buildMinutesDocx } from "../lib/minutesDocx";
import type { MinutesRecord } from "../lib/minutesData";
import type { SchoolBranding } from "../lib/branding";
import { PLACEHOLDERS, REQUIRED_PLACEHOLDER } from "../lib/letterhead";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, extra = "") {
  if (ok) {
    pass++;
    console.log(`  ok   ${label}${extra ? "  " + extra : ""}`);
  } else {
    fail++;
    console.error(`  FAIL ${label}${extra ? "  " + extra : ""}`);
  }
}

const branding = {
  key: "hvps",
  schoolType: "public",
  shortName: "HVPS",
  fullName: "Hurlyvale Primary School",
  portalSubtitle: "Compliance Portal",
  tagline: "SGB Compliance Portal",
  slogan: "",
  logo: "/logo.png",
  logoAlt: "crest",
  fromEmail: "HVPS <noreply@example.test>",
  colors: {
    primary: "#00BCD4",
    primaryDark: "#00838F",
    dark: "#1A1A1A",
    primaryTint: "#e0f7fa",
    accent: "#00BCD4",
  },
} as SchoolBranding;

const record: MinutesRecord = {
  id: "m1",
  title: "SGB meeting, 7 May 2026",
  body: "sgb",
  period: { kind: "month", year: 2026, month: 5 },
  status: "awaiting_signatures",
  draftNumber: 2,
  sections: [
    { id: "a", title: "Attendance and apologies", body: "Present: Dee, Rob.", order: 1 },
    { id: "b", title: "Previous minutes", body: "Accepted.", order: 2, numberingStartsHere: true },
    { id: "c", title: "Finance report", body: "R52,000 approved for sound.", order: 3, responsible: "Kevin James" },
  ],
  signatories: [],
  reviews: [],
  createdAt: "2026-05-07T00:00:00.000Z",
  createdBy: "sec@x.test",
  updatedAt: "2026-05-07T00:00:00.000Z",
};

/** A real PNG, so the crest in the fixture letterhead is genuine bytes. */
function png(w: number, h: number): Buffer {
  const table = [...Array(256)].map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    let crc = 0xffffffff;
    for (const b of td) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
    const cb = Buffer.alloc(4);
    cb.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, td, cb]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rows = [...Array(h)].map(() =>
    Buffer.concat([Buffer.from([0]), Buffer.concat([...Array(w)].map(() => Buffer.from([200, 20, 60])))])
  );
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A stand-in for a school's letterhead: crest and name in a real Word HEADER,
 *  address in a FOOTER, standing wording in the body, and the marker. */
async function fixture(): Promise<Buffer> {
  return Packer.toBuffer(
    new Document({
      sections: [
        {
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  children: [
                    new ImageRun({ type: "png", data: png(24, 24), transformation: { width: 60, height: 60 } }),
                  ],
                }),
                new Paragraph({ children: [new TextRun("HURLYVALE PRIMARY SCHOOL")] }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [new Paragraph({ children: [new TextRun("12 Smith Road, Edenvale")] })],
            }),
          },
          children: [
            new Paragraph({ children: [new TextRun("MINUTES OF {{meeting}} MEETING")] }),
            new Paragraph({ children: [new TextRun("{{period}}  {{draft}}")] }),
            new Paragraph({ children: [new TextRun("GOVERNING BODY: Mrs Lester, Mr Scott")] }),
            new Paragraph({ children: [new TextRun("{{content}}")] }),
          ],
        },
      ],
    })
  );
}

(async () => {
  console.log("\nThe marker list a person reads is the list the builder honours");
  {
    const names = PLACEHOLDERS.map((p) => p.name);
    check("content is on the list", names.includes(REQUIRED_PLACEHOLDER));
    check("every entry explains itself", PLACEHOLDERS.every((p) => p.what.trim().length > 10));
    check("no duplicates", new Set(names).size === names.length);
  }

  const letterhead = await fixture();
  console.log("\nDetection at upload, which is what makes a bad file fail early");
  {
    const found = [...(await patchDetector({ data: letterhead }))];
    check("the markers are found", found.includes("content"), found.join(", "));
    // 🔴 A letterhead with no {{content}} must be refused at UPLOAD. Accepting
    // it produces empty minutes, discovered by a secretary sending them to the
    // DoE.
    const bare = await Packer.toBuffer(
      new Document({ sections: [{ children: [new Paragraph("No marker here")] }] })
    );
    const none = [...(await patchDetector({ data: bare }))];
    check("a letterhead without one is detectably empty", !none.includes("content"));
  }

  console.log("\n🔴 Their letterhead survives, ours is not printed on top of it");
  {
    const out = await buildMinutesDocx(record, branding, png(16, 16), new Map(), letterhead);
    writeFileSync("letterhead-check.docx", out);
    const zip = new AdmZip(out);
    const names = zip.getEntries().map((e) => e.entryName);
    const xml = zip.readAsText("word/document.xml");

    const headerPart = names.find((n) => /header\d*\.xml$/.test(n));
    const footerPart = names.find((n) => /footer\d*\.xml$/.test(n));
    check("their Word header survived", !!headerPart && zip.readAsText(headerPart).includes("HURLYVALE"));
    check("their footer survived", !!footerPart && zip.readAsText(footerPart).includes("Smith Road"));
    check("their standing wording survived", xml.includes("GOVERNING BODY"));
    const media = zip.getEntries().filter((e) => e.entryName.startsWith("word/media/") && !e.isDirectory);
    check("their crest survived as real bytes", media.length > 0 && media.every((m) => (zip.readFile(m)?.length ?? 0) > 0), `${media.length} image(s)`);

    check("our table is inside it", xml.includes("<w:tbl>"));
    check("with the minutes in it", xml.includes("Finance report") && xml.includes("Kevin James"));
    check("and the numbering", xml.includes(">1<") && xml.includes(">2<"));

    // 🔴 The whole point of uploading a letterhead: we must NOT also print our
    // own generated masthead underneath theirs.
    check(
      "our generated masthead is NOT printed too",
      !xml.includes("SGB meeting minutes"),
      "no duplicate header"
    );

    // Optional markers filled in.
    check("the meeting marker was filled", xml.includes("SGB") && !xml.includes("{{meeting}}"));
    check("the period marker was filled", xml.includes("May 2026") && !xml.includes("{{period}}"));
    check("the draft marker was filled", xml.includes("DRAFT 2") && !xml.includes("{{draft}}"));
    // 🔴 No template syntax may reach a document a school sends out.
    check("no marker syntax is left anywhere", !/\{\{[a-z]+\}\}/.test(xml));
  }

  console.log("\nA signed set must not go out saying DRAFT");
  {
    const signed = { ...record, status: "signed" as const, signedAt: "2026-05-20T00:00:00.000Z" };
    const out = await buildMinutesDocx(signed, branding, null, new Map(), letterhead);
    const xml = new AdmZip(out).readAsText("word/document.xml");
    check("the draft marker is blanked, not left raw", !xml.includes("{{draft}}"));
    check("and says nothing about a draft", !xml.includes("DRAFT"));
  }

  console.log("\nThe governing body table, for a letterhead that asks for one");
  {
    // A letterhead that uses {{governors}} instead of typing the table out.
    const withGovernors = await Packer.toBuffer(
      new Document({
        sections: [
          {
            children: [
              new Paragraph({ children: [new TextRun("GOVERNING BODY")] }),
              new Paragraph({ children: [new TextRun("{{governors}}")] }),
              new Paragraph({ children: [new TextRun("{{content}}")] }),
            ],
          },
        ],
      })
    );

    const holders = new Map<string, string[]>([
      ["Principal", ["Rob Hutcheon"]],
      // 🔴 Two people in one seat. Taking the first would quietly drop
      // somebody off the school's own letterhead.
      ["Co-opted SGB", ["Ann Weber", "Sipho Dlamini"]],
    ]);
    const out = await buildMinutesDocx(
      record,
      branding,
      null,
      new Map(),
      withGovernors,
      holders
    );
    const xml = new AdmZip(out).readAsText("word/document.xml");

    check("the holder is named", xml.includes("Rob Hutcheon"));
    check("both holders of a shared seat are named", xml.includes("Ann Weber, Sipho Dlamini"));
    check("a position nobody holds is shown as Vacant", xml.includes("Vacant"));
    // Order is the position list's, not the register's - or the table would
    // come out differently every time somebody was added.
    check(
      "Principal comes before Co-opted SGB",
      xml.indexOf("Principal") < xml.indexOf("Co-opted SGB")
    );
    check("no marker syntax left behind", !xml.includes("{{governors}}"));
    check("and the minutes still went in", xml.includes("Finance report"));
  }

  console.log("\nA letterhead with no {{governors}} keeps its own typed table");
  {
    // Every letterhead that exists today is this case. The patch must be a
    // no-op rather than an error, or shipping this would break them all.
    const out = await buildMinutesDocx(
      record,
      branding,
      null,
      new Map(),
      letterhead,
      new Map([["Principal", ["Rob Hutcheon"]]])
    );
    const xml = new AdmZip(out).readAsText("word/document.xml");
    check("the typed table survives", xml.includes("Mrs Lester, Mr Scott"));
    check("and no generated one appears", !xml.includes("Rob Hutcheon"));
  }

  console.log("\nWithout a letterhead nothing changes");
  {
    const out = await buildMinutesDocx(record, branding, png(16, 16), new Map(), null);
    const xml = new AdmZip(out).readAsText("word/document.xml");
    check("the generated masthead is back", xml.includes("Hurlyvale Primary School"));
    check("and the meeting line", xml.includes("SGB meeting minutes"));
    check("with the table", xml.includes("<w:tbl>"));
  }

  // Run against Carl's real letterhead when it is to hand. A fixture I wrote
  // agrees with my own assumptions; his file is the one that finds them wrong.
  const real = process.argv[2];
  if (real && existsSync(real)) {
    console.log(`\nAgainst the real letterhead: ${real}`);
    const bytes = Buffer.from(require("fs").readFileSync(real));
    const found = [...(await patchDetector({ data: bytes }))];
    console.log(`  markers found: ${found.length ? found.join(", ") : "(none)"}`);
    if (found.includes("content")) {
      const out = await buildMinutesDocx(record, branding, null, new Map(), bytes);
      writeFileSync("letterhead-real.docx", out);
      const xml = new AdmZip(out).readAsText("word/document.xml");
      check("the minutes are in the real letterhead", xml.includes("Finance report"));
      check("no marker syntax left", !/\{\{[a-z]+\}\}/.test(xml));
      console.log("  wrote letterhead-real.docx");
    } else {
      console.log("  (no {{content}} marker, so it would be refused at upload, correctly)");
    }
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
