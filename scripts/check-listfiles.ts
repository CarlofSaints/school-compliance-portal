// Proves the listFiles child-name logic, with no blob.
//
//   npx tsx scripts/check-listfiles.ts
//
// 🔴 This is the bug Carl hit on his first real upload: one set of minutes
// appeared TWICE in the list. listFiles returns the first path segment of every
// blob, and a set of minutes writes two blobs under its own folder, so its id
// came back once per blob.
//
// The logic is reproduced here rather than imported, because the real function
// needs a blob store and a request scope. It is the same three lines.

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

/** The OLD behaviour, kept so the regression is visible rather than described. */
function oldChildNames(prefix: string, pathnames: string[]): string[] {
  return pathnames
    .map((full) => (full.startsWith(prefix) ? full.slice(prefix.length) : full))
    .map((rel) => rel.split("/")[0])
    .filter((n) => n.length > 0);
}

/** The fixed behaviour: each child ONCE. */
function childNames(prefix: string, pathnames: string[]): string[] {
  const names = new Set<string>();
  for (const full of pathnames) {
    const rel = full.startsWith(prefix) ? full.slice(prefix.length) : full;
    const name = rel.split("/")[0];
    if (name) names.add(name);
  }
  return [...names];
}

console.log("\nThe exact case Carl hit");
{
  const prefix = "hvps/minutes/";
  // One set of minutes, uploaded with a file: TWO blobs under one folder.
  const blobs = [
    "hvps/minutes/fb4e5727/record.json",
    "hvps/minutes/fb4e5727/original.docx",
  ];
  check("the old code listed it twice", oldChildNames(prefix, blobs), ["fb4e5727", "fb4e5727"]);
  check("now it lists once", childNames(prefix, blobs), ["fb4e5727"]);
}

console.log("\nThe same bug elsewhere");
{
  // The audit trail writes one blob PER ENTRY, so the month picker would have
  // repeated a month once per entry.
  const prefix = "hvps/activity/";
  const blobs = [
    "hvps/activity/2026-09/2026-09-01T10:00:00.000Z-aaa.json",
    "hvps/activity/2026-09/2026-09-01T11:00:00.000Z-bbb.json",
    "hvps/activity/2026-09/2026-09-02T09:00:00.000Z-ccc.json",
    "hvps/activity/2026-08/2026-08-30T09:00:00.000Z-ddd.json",
  ];
  check("the old code repeated the month", oldChildNames(prefix, blobs).length, 4);
  check("now one entry per month", childNames(prefix, blobs).sort(), ["2026-08", "2026-09"]);

  // A user with a tombstone has two blobs, so repairUserIndex processed them
  // twice. Harmless but wasteful, and it came from the same line.
  const users = ["hvps/users/u1/record.json", "hvps/users/u1/deleted.json", "hvps/users/u2/record.json"];
  check("a tombstoned user is listed once", childNames("hvps/users/", users).sort(), ["u1", "u2"]);
}

console.log("\nEdge cases that must not break it");
{
  check("nothing there", childNames("hvps/minutes/", []), []);
  check(
    "a blob directly under the prefix",
    childNames("hvps/minutes/", ["hvps/minutes/loose.json"]),
    ["loose.json"]
  );
  check(
    "the folder marker itself is skipped",
    childNames("hvps/minutes/", ["hvps/minutes/"]),
    []
  );
  check(
    "deep nesting still yields the top child",
    childNames("hvps/minutes/", ["hvps/minutes/a/b/c/d.json"]),
    ["a"]
  );
  check(
    "a pathname that does not match the prefix is kept whole",
    childNames("hvps/minutes/", ["other/thing.json"]),
    ["other"]
  );
  // Order matters for the caller only in that it must be stable; a Set
  // preserves insertion order in JS.
  check(
    "insertion order is preserved",
    childNames("p/", ["p/c/x", "p/a/x", "p/b/x", "p/a/y"]),
    ["c", "a", "b"]
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
