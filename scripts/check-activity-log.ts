// Proves the audit trail's rules with no server and no blob.
//
//   npx tsx scripts/check-activity-log.ts
//
// The CSV goes to a school's auditor and the ordering is what an audit is read
// by, so both are worth pinning down.

import { activityToCsv, type ActivityEntry } from "../lib/activityLog";

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
function checkThat(label: string, cond: boolean) {
  check(label, cond, true);
}

function entry(over: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: "abc123",
    at: "2026-09-05T10:00:00.000Z",
    actorId: "u1",
    actorName: "Dee Schoultz",
    actorEmail: "dschoultz@example.test",
    action: "spend.approved",
    entity: "spend",
    entityId: "s1",
    summary: "approved \"New roof\" (R120,000)",
    ...over,
  };
}

console.log("\nCSV survives the things that break CSVs");
{
  const csv = activityToCsv([
    entry({ summary: 'Approved "New roof, phase 2" for R120,000' }),
  ]);
  // A comma inside a field must not create a column.
  const dataLine = csv.split("\r\n")[1];
  const cols = dataLine.match(/"(?:[^"]|"")*"/g) || [];
  check("a comma in the summary does not add a column", cols.length, 9);
  checkThat("an embedded quote is doubled", dataLine.includes('""New roof, phase 2""'));

  const withNewline = activityToCsv([entry({ summary: "line one\nline two" })]);
  // The row is still one logical record even though it contains a newline.
  checkThat("a newline stays inside its quoted field", withNewline.includes('"line one\nline two"'));
}

console.log("\nExcel opens it as UTF-8");
{
  const csv = activityToCsv([entry({ actorName: "Zoë Naudé" })]);
  check("starts with a BOM", csv.charCodeAt(0), 0xfeff);
  checkThat("the accented name survives", csv.includes("Zoë Naudé"));
  checkThat("rows are CRLF terminated", csv.includes("\r\n"));
}

console.log("\nOrdering: an audit is read oldest first");
{
  const csv = activityToCsv([
    // The grid hands them over newest first, so the export must flip them.
    entry({ id: "c", at: "2026-09-05T12:00:00.000Z", summary: "third" }),
    entry({ id: "b", at: "2026-09-05T11:00:00.000Z", summary: "second" }),
    entry({ id: "a", at: "2026-09-05T10:00:00.000Z", summary: "first" }),
  ]);
  const lines = csv.split("\r\n");
  checkThat("row 1 is the oldest", lines[1].includes("first"));
  checkThat("row 3 is the newest", lines[3].includes("third"));
}

console.log("\nEmpty and missing values do not break a row");
{
  const csv = activityToCsv([
    entry({ actorEmail: undefined, entityId: undefined, ip: undefined, detail: undefined }),
  ]);
  const dataLine = csv.split("\r\n")[1];
  const cols = dataLine.match(/"(?:[^"]|"")*"/g) || [];
  check("still nine columns", cols.length, 9);
  checkThat("no literal undefined leaks in", !dataLine.includes("undefined"));

  check("an empty log still has its header", activityToCsv([]).split("\r\n").length, 1);
}

console.log("\nDetail is preserved for the auditor");
{
  const csv = activityToCsv([
    entry({
      action: "spend.approved.override",
      detail: { reason: "Chair away, urgent roof leak", amount: 120000, bypassedApprovers: ["FINCOM"] },
    }),
  ]);
  checkThat("the override reason is in the file", csv.includes("Chair away, urgent roof leak"));
  checkThat("the bypassed approvers are in the file", csv.includes("FINCOM"));
  checkThat("the action key is in the file", csv.includes("spend.approved.override"));
}

console.log("\nFormula injection is neutralised in every field");
{
  const cells = activityToCsv([
    entry({ actorName: "=HYPERLINK(\"http://evil.test\")", actorEmail: "+27 evil", summary: "-1+1", ip: "@SUM(A1)", entityId: "\tx", action: "\r=1" }),
  ]).split("\r\n")[1];
  checkThat("= cell gets a leading quote", cells.includes("\"'=HYPERLINK("));
  checkThat("+ cell gets a leading quote", cells.includes("\"'+27 evil\""));
  checkThat("- cell gets a leading quote", cells.includes("\"'-1+1\""));
  checkThat("@ cell gets a leading quote", cells.includes("\"'@SUM(A1)\""));
  checkThat("tab cell gets a leading quote", cells.includes("\"'\tx\""));
  checkThat("CR cell gets a leading quote", activityToCsv([entry({ action: "\r=1" })]).includes("\"'\r=1\""));
  checkThat("an ordinary cell is left alone", activityToCsv([entry()]).includes("\"Dee Schoultz\""));
  const nums = activityToCsv([entry({ summary: "-500", actorEmail: "+27 82 123 4567", entityId: "-12.5" })]).split("\r\n")[1];
  const lead = activityToCsv([entry({ summary: " =1", actorEmail: "\n=HYPERLINK(1)", entityId: "  +x" })]);
  checkThat("leading space before = is caught", lead.includes("\"' =1\""));
  checkThat("leading newline before = is caught", lead.includes("\"'\n=HYPERLINK(1)\""));
  checkThat("leading spaces before + is caught", lead.includes("\"'  +x\""));
  checkThat("a negative number is left alone", nums.includes("\"-500\""));
  checkThat("a phone number is left alone", nums.includes("\"+27 82 123 4567\""));
  checkThat("a negative decimal is left alone", nums.includes("\"-12.5\""));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
