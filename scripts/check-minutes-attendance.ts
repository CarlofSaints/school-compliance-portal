// Proves attendance lists, with no server.
//
//   npx tsx scripts/check-minutes-attendance.ts
//
// Carl typed his governing body into a section with spaces lining the names
// up, and it came out ragged in Word. Attendance is now stored as two real
// columns. The rules that matter:
//
// 🔴 Minutes with NO attendance list must hash exactly as they did before, or
//    every signature already collected reads as if the document was edited.
// 🔴 A Word table cell must never END on a table; Word calls that file corrupt.

import JSZip from "jszip";
import {
  canonicalMinutes,
  cleanAttendees,
  rowsFromText,
  sectionsFromTemplate,
  formatPeriod,
  sectionNumbers,
  type MinutesSection,
  type MinutesTemplate,
} from "../lib/minutes";
import { buildMinutesDocx } from "../lib/minutesDocx";
import type { MinutesRecord } from "../lib/minutesData";
import type { SchoolBranding } from "../lib/branding";

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.error(`  FAIL ${label}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`);
  }
}
const checkThat = (label: string, cond: boolean) => check(label, cond, true);

// ---------------------------------------------------------------------------
console.log("\nTurning a typed list into rows");

// Carl's own template text, spacing as he typed it.
const carls = [
  "MINUTES OF SGB MEETING",
  "HELD ON THURSDAY 7TH OF MAY 2026 AT 17H30",
  "",
  "  GOVERNING BODY",
  "    Chair                             Mrs Lester (DL)",
  "                  Vice chair/IT                   Mr Scott (BS)",
  "    Treasurer                         Ms Vukoicic (TV)",
  "        Principal                                 Mrs Schoultz (DS)",
  "      Deputy Principal                               Ms Reddy (KR)",
  "                   Business Administration                          Mrs Boyd (JB)",
  "     IT/ E learning                   Mrs Haydock (HH)",
  " Secretary/Policy                 Mr Dos Santos (CDS)",
  " Fundraising                  Mr Furlong (JF)",
  " Grounds/Building              Mr James (KJ)",
  " Staff Representative (extra-murals)        Mr Hutcheon (RH)",
  " Co-opted member                  Ms Rowe (GR)",
  "Maintenance Manager                  Mr Cuerden (GC)",
  "Grade R Principal               Mrs Vanessa",
  "",
].join("\n");

const { rows, leftover } = rowsFromText(carls);
check("all 14 people become rows", rows.length, 14);
check("first row", rows[0], { position: "Chair", name: "Mrs Lester (DL)" });
check("a position with a slash and indent", rows[1], { position: "Vice chair/IT", name: "Mr Scott (BS)" });
check("a position containing brackets", rows[10], {
  position: "Staff Representative (extra-murals)",
  name: "Mr Hutcheon (RH)",
});
check("last row", rows[13], { position: "Grade R Principal", name: "Mrs Vanessa" });
check(
  "title lines are NOT rows and are handed back, not lost",
  leftover,
  "MINUTES OF SGB MEETING\nHELD ON THURSDAY 7TH OF MAY 2026 AT 17H30\nGOVERNING BODY"
);
check("a TAB separates as well", rowsFromText("Chair\tMrs Lester").rows, [
  { position: "Chair", name: "Mrs Lester" },
]);
check("single spaces do not split a position", rowsFromText("Deputy Principal").rows, []);
check("CRLF text from Windows", rowsFromText("Chair   A\r\nPrincipal   B").rows.length, 2);

// ---------------------------------------------------------------------------
console.log("\nCleaning rows");
check("blank rows dropped, cells trimmed", cleanAttendees([
  { position: " Chair ", name: " A " },
  { position: "", name: "" },
  { position: "Principal", name: "" },
]), [
  { position: "Chair", name: "A" },
  { position: "Principal", name: "" },
]);
check("an empty list stores nothing", cleanAttendees([{ position: " ", name: "" }]), undefined);
check("not an array stores nothing", cleanAttendees("nope"), undefined);

// ---------------------------------------------------------------------------
console.log("\nThe signing hash");

// The formula as it was BEFORE attendance existed, rebuilt here by hand. If
// canonicalMinutes stops matching it for minutes with no attendance list, old
// signatures break.
const US = String.fromCharCode(0x1f);
const RS = String.fromCharCode(0x1e);
function oldCanonical(m: { title: string; body: "sgb"; period: MinutesRecord["period"]; sections: MinutesSection[] }) {
  const numbers = sectionNumbers(m.sections);
  const sections = [...m.sections]
    .sort((a, b) => a.order - b.order)
    .map((s) =>
      [numbers.get(s.id) ?? "", s.title.trim(), (s.body || "").replace(/\r\n/g, "\n").trim(), (s.responsible || "").trim()].join(US)
    );
  return [m.title.trim(), m.body, formatPeriod(m.period), ...sections].join(RS);
}

const plain = {
  title: "SGB meeting, 7 May 2026",
  body: "sgb" as const,
  period: { kind: "month" as const, year: 2026, month: 5 },
  sections: [
    { id: "a", title: "Attendance", body: "Present: all", order: 1, numberingStartsHere: false },
    { id: "b", title: "Finance", body: "Tabled", order: 2, numberingStartsHere: true, responsible: "Treasurer" },
  ],
};
check("minutes with no attendance list hash EXACTLY as before", canonicalMinutes(plain), oldCanonical(plain));

const withList = {
  ...plain,
  sections: [
    { ...plain.sections[0], kind: "attendance" as const, attendees: [{ position: "Chair", name: "Mrs Lester" }] },
    plain.sections[1],
  ],
};
checkThat("an attendance list is part of what is signed", canonicalMinutes(withList) !== canonicalMinutes(plain));
const renamed = {
  ...withList,
  sections: [
    { ...withList.sections[0], attendees: [{ position: "Chair", name: "Mr Somebody" }] },
    plain.sections[1],
  ],
};
checkThat("changing a name after signing changes the hash", canonicalMinutes(renamed) !== canonicalMinutes(withList));

// ---------------------------------------------------------------------------
console.log("\nCopying a template");
const template: MinutesTemplate = {
  id: "t",
  name: "SGB",
  sections: [
    {
      id: "s1",
      title: "GOVERNING BODY",
      order: 1,
      kind: "attendance",
      attendees: [
        { position: "SGB Chairperson", name: "Mrs Lester (DL)" },
        { position: "Principal", name: "" },
        { position: "Grade R Principal", name: "" },
      ],
    },
    { id: "s2", title: "Finance", order: 2, numberingStartsHere: true },
  ],
  createdAt: "",
  createdBy: "",
  updatedAt: "",
};
const copied = sectionsFromTemplate(template, new Map([["Principal", "Dee Schoultz"]]));
check("kind is carried into the minutes", copied[0].kind, "attendance");
check("a typed name is kept as typed", copied[0].attendees?.[0].name, "Mrs Lester (DL)");
check("a blank name takes whoever holds the position now", copied[0].attendees?.[1].name, "Dee Schoultz");
check("a position nobody holds stays blank rather than vanishing", copied[0].attendees?.[2], {
  position: "Grade R Principal",
  name: "",
});
check("a text section gets no attendance fields", [copied[1].kind, copied[1].attendees], [undefined, undefined]);
template.sections[0].attendees![0].name = "Changed later";
check("editing the template later does not touch the copy", copied[0].attendees?.[0].name, "Mrs Lester (DL)");

// ---------------------------------------------------------------------------
console.log("\nThe Word file");

const branding = {
  fullName: "Test Primary School",
  shortName: "TPS",
  colors: { primary: "#1e3a5f" },
} as unknown as SchoolBranding;

function record(sections: MinutesSection[]): MinutesRecord {
  return {
    id: "m1",
    title: "SGB meeting",
    body: "sgb",
    period: { kind: "month", year: 2026, month: 5 },
    status: "draft",
    sections,
    signatories: [],
    reviews: [],
    draftNumber: 0,
    createdAt: "",
    createdBy: "",
    updatedAt: "",
  };
}

async function documentXml(r: MinutesRecord): Promise<string> {
  const bytes = await buildMinutesDocx(r, branding, null);
  const zip = await JSZip.loadAsync(bytes);
  return (await zip.file("word/document.xml")!.async("string")) as string;
}

(async () => {
  const leadingList = record([
    { id: "a", title: "GOVERNING BODY", body: "", order: 1, kind: "attendance", attendees: rows },
    { id: "b", title: "Finance report", body: "Tabled and accepted.", order: 2, numberingStartsHere: true },
  ]);
  const xml = await documentXml(leadingList);
  checkThat("the names are in the document", xml.includes("Mrs Lester (DL)") && xml.includes("Mrs Vanessa"));
  checkThat("positions are in their own cells", xml.includes(">Staff Representative (extra-murals)<"));
  checkThat(
    "the list comes BEFORE the numbered table",
    xml.indexOf("Mrs Lester (DL)") < xml.indexOf("Finance report")
  );
  checkThat("the heading is there", xml.includes(">GOVERNING BODY<"));
  checkThat("the list table has its borders switched off", /<w:tblBorders>[\s\S]*?w:val="none"/.test(xml));
  check("two tables: the list and the numbered items", (xml.match(/<w:tbl>/g) || []).length, 2);

  // An attendance list INSIDE the numbered table (no start point set).
  const inTable = record([
    { id: "a", title: "Attendance", body: "", order: 1, kind: "attendance", attendees: rows.slice(0, 2) },
    { id: "b", title: "Finance", body: "Tabled", order: 2 },
  ]);
  const xml2 = await documentXml(inTable);
  checkThat("a nested list is still written", xml2.includes("Mr Scott (BS)"));
  checkThat(
    "no table cell ENDS on a table (Word calls that corrupt)",
    !/<\/w:tbl>\s*<\/w:tc>/.test(xml2)
  );

  // Minutes with no attendance and no start point: the table it always was.
  const classic = record([
    { id: "a", title: "Attendance", body: "Present: all", order: 1 },
    { id: "b", title: "Finance", body: "Tabled", order: 2 },
  ]);
  const xml3 = await documentXml(classic);
  check("minutes without a list still produce exactly one table", (xml3.match(/<w:tbl>/g) || []).length, 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
