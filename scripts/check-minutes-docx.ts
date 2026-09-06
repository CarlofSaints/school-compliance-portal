// Builds a real .docx and inspects it.
//
//   npx tsx scripts/check-minutes-docx.ts [out.docx]
//
// "It compiled" says nothing about whether Word can open the file, and the one
// failure that matters is invisible from the source: 🔴 an image that is LINKED
// rather than EMBEDDED produces a document that looks right on the machine that
// made it and shows a red X everywhere else. word/media holding real bytes is
// the only proof.

import { writeFileSync } from "fs";
import zlib from "zlib";
import AdmZip from "adm-zip";
import { buildMinutesDocx } from "../lib/minutesDocx";
import type { MinutesRecord } from "../lib/minutesData";
import type { SchoolBranding } from "../lib/branding";

const branding = {
  key: "hvps",
  schoolType: "public",
  shortName: "HVPS",
  fullName: "Hurlyvale Primary School",
  portalSubtitle: "Compliance Portal",
  tagline: "SGB Compliance Portal",
  slogan: "We are family!",
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
    { id: "a", title: "Attendance and apologies", body: "Present: Dee Schoultz, Rob Hutcheon.\nApologies: Kevin James.", order: 1 },
    { id: "b", title: "Previous minutes", body: "Accepted.", order: 2, numberingStartsHere: true },
    { id: "c2", title: "Finance report", body: "Budget reviewed.\nR52,000 approved for sound and lighting.", order: 3, responsible: "Kevin James" },
    { id: "d", title: "Grounds and maintenance", body: "", order: 4, responsible: "Graham Cuerden" },
  ],
  signatories: [
    {
      personId: "p1", name: "Dee Schoultz", email: "d@x.test", role: "sgb_chair",
      signedAt: "2026-05-10T09:00:00.000Z", documentHash: "a".repeat(64),
    },
    { personId: "p2", name: "Rob Hutcheon", email: "r@x.test", role: "principal" },
  ],
  reviews: [],
  createdAt: "2026-05-07T00:00:00.000Z",
  createdBy: "sec@x.test",
  updatedAt: "2026-05-07T00:00:00.000Z",
};

/** A real PNG, built by hand so the check needs no fixture file on disk. */
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
  ihdr[9] = 2; // 8-bit RGB
  const rows = [...Array(h)].map(() =>
    Buffer.concat([Buffer.from([0]), Buffer.concat([...Array(w)].map(() => Buffer.from([0, 188, 212])))])
  );
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let fails = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) fails++;
}

(async () => {
  const out = process.argv[2] || "minutes-check.docx";
  const crest = png(16, 16);
  const buf = await buildMinutesDocx(record, branding, crest);
  writeFileSync(out, buf);
  console.log(`\nwrote ${out}, ${buf.length} bytes\n`);

  console.log("It is a real Word file");
  check("starts with the zip magic PK", buf.subarray(0, 2).toString() === "PK");

  const zip = new AdmZip(out);
  const entries = zip.getEntries().map((e) => e.entryName);
  for (const n of ["[Content_Types].xml", "word/document.xml", "word/_rels/document.xml.rels"]) {
    check(`${n} present`, entries.includes(n));
  }
  check("a footer part exists", entries.some((e) => /footer\d*\.xml/.test(e)));

  console.log("\nThe content is actually in it");
  const xml = zip.readAsText("word/document.xml");
  for (const s of [
    "Hurlyvale Primary School",
    "SGB meeting, 7 May 2026",
    "Attendance and apologies",
    "R52,000 approved for sound and lighting.",
    "DRAFT 2",
    "Signatures",
    "Rob Hutcheon",
    "Signed electronically",
  ]) {
    check(`contains "${s}"`, xml.includes(s));
  }
  // An empty section must still appear, or a reader cannot tell the difference
  // between "not discussed" and "we forgot to include it".
  check('an empty section still says "Nothing recorded"', xml.includes("Nothing recorded"));

  console.log("\n🔴 It is a TABLE: number, item, responsible");
  check("the body is a table", xml.includes("<w:tbl>"));
  check("header column No.", xml.includes(">No.<"));
  check("header column Item", xml.includes(">Item<"));
  check("header column Responsible", xml.includes(">Responsible<"));
  check("the header repeats across pages", xml.includes("tblHeader"));
  check("the responsible person is named", xml.includes("Kevin James"));
  check("and the second one", xml.includes("Graham Cuerden"));
  // The number lives in column 1, so it must NOT also be glued to the heading.
  check("the heading is not prefixed with its number", !xml.includes("2. Finance report"));
  const rowCount = (xml.match(/<w:tr>/g) || []).length;
  check("a header row plus one per section", rowCount >= 5, `${rowCount} rows`);

  console.log("\n🔴 The crest is EMBEDDED, not linked");
  // isDirectory, because a zip carries a 0-byte entry for the folder itself and
  // counting it as an image reports a false failure.
  const media = zip
    .getEntries()
    .filter((e) => e.entryName.startsWith("word/media/") && !e.isDirectory);
  check("word/media contains at least one file", media.length > 0, `(${media.length})`);
  for (const m of media) {
    const bytes = zip.readFile(m);
    check(`${m.entryName} has real bytes`, !!bytes && bytes.length > 0, `${bytes?.length ?? 0} bytes`);
  }
  // A linked image leaves a reference to a path on disk instead of a part.
  check("no external image link in the rels", !zip.readAsText("word/_rels/document.xml.rels").includes("TargetMode=\"External\""));

  console.log("\nA missing crest must not lose the document");
  const noCrest = await buildMinutesDocx(record, branding, null);
  check("still builds without a crest", noCrest.length > 5000);
  check("and still has the minutes in it", new AdmZip(noCrest).readAsText("word/document.xml").includes("Finance report"));

  console.log(`\n${fails === 0 ? "all checks passed" : fails + " FAILED"}\n`);
  process.exit(fails === 0 ? 0 : 1);
})();
