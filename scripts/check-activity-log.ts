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

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
