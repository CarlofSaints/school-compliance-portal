// Proves the template-to-minutes copy, with no server.
//
//   npx tsx scripts/check-minutes-templates.ts
//
// 🔴 The rule that matters: a template is COPIED into a set of minutes, never
// referenced. If minutes rendered live from a template, editing that template
// next year would silently rewrite what a meeting in 2026 appears to have
// discussed, and a SIGNED record would change under its own signatures.

import {
  sectionsFromTemplate,
  sectionNumbers,
  numberedTitle,
  STARTER_TEMPLATE,
  type MinutesTemplate,
} from "../lib/minutes";

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

function template(over: Partial<MinutesTemplate> = {}): MinutesTemplate {
  return {
    id: "t1",
    name: "SGB monthly",
    body: "sgb",
    sections: [
      {
        id: "s1",
        title: "Attendance and apologies",
        staticContent: "Present:\n\nApologies:",
        positions: ["Secretary"],
        order: 1,
      },
      { id: "s2", title: "Finance report", positions: ["SGB Treasurer"], order: 2 },
      { id: "s3", title: "General", order: 3 },
    ],
    createdAt: "2026-09-01T00:00:00.000Z",
    createdBy: "admin@x.test",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

console.log("\nStanding wording becomes the section's starting text");
{
  const t = template();
  const sections = sectionsFromTemplate(t);
  check("every section is carried over", sections.length, 3);
  check("titles survive", sections.map((s) => s.title), [
    "Attendance and apologies",
    "Finance report",
    "General",
  ]);
  // The whole point of the feature: the attendees are already there.
  check("static content becomes the body", sections[0].body, "Present:\n\nApologies:");
  check("a section with no wording starts empty", sections[1].body, "");
  check("order is 1..n", sections.map((s) => s.order), [1, 2, 3]);
}

console.log("\n🔴 It is a COPY, not a reference");
{
  const t = template();
  const sections = sectionsFromTemplate(t);

  // New ids, or editing a section in the minutes would look like editing the
  // template, and two sets of minutes from one template would share ids.
  checkThat(
    "sections get fresh ids",
    sections.every((s) => !["s1", "s2", "s3"].includes(s.id))
  );
  checkThat("ids are unique", new Set(sections.map((s) => s.id)).size === 3);

  // Two sets of minutes from one template must not share anything.
  const a = sectionsFromTemplate(t);
  const b = sectionsFromTemplate(t);
  checkThat("two copies share no ids", a.every((s) => !b.some((o) => o.id === s.id)));

  // Editing the copy must not touch the template.
  a[0].body = "Present: everyone";
  check("the template is untouched", t.sections[0].staticContent, "Present:\n\nApologies:");

  // Editing the template must not touch an existing copy.
  t.sections[0].staticContent = "Completely different";
  check("an existing copy is untouched", a[0].body, "Present: everyone");
}

console.log("\n🔴 The template names a POSITION; the minutes freeze a NAME");
{
  // Carl: "if we tag SGB Chair, then when the chair is gone and there is a new
  // chair, the template lives on and does not need editing."
  //
  // So the template holds the position, and the copy resolves it once to
  // whoever holds it at that meeting. A live link would rename last year's
  // participants at every election, and would change a SIGNED record.
  const holders = new Map([
    ["Secretary", "Dee Schoultz"],
    ["SGB Treasurer", "Kevin James"],
  ]);

  const sections = sectionsFromTemplate(template(), holders);
  check("the position resolves to a name", sections[0].responsible, "Dee Schoultz");
  check("and per section", sections[1].responsible, "Kevin James");
  check("a section with no position stays blank", sections[2].responsible, undefined);

  // The template is untouched: it still names the position, not the person.
  check("the template still holds the POSITION", template().sections[1].positions, [
    "SGB Treasurer",
  ]);

  // 🔴 The point of freezing. A new treasurer does not rewrite old minutes.
  const afterElection = new Map([
    ["Secretary", "Dee Schoultz"],
    ["SGB Treasurer", "Somebody Else"],
  ]);
  const newMinutes = sectionsFromTemplate(template(), afterElection);
  check("new minutes pick up the new holder", newMinutes[1].responsible, "Somebody Else");
  check("the earlier minutes still say the old one", sections[1].responsible, "Kevin James");

  // A vacant seat keeps the position name, which tells a reader more than a
  // blank cell does.
  const vacant = sectionsFromTemplate(template(), new Map());
  check("an unfilled position falls back to its own name", vacant[1].responsible, "SGB Treasurer");
}

console.log("\nOrder is respected, not insertion order");
{
  const t = template({
    sections: [
      { id: "c", title: "Third", order: 3 },
      { id: "a", title: "First", order: 1 },
      { id: "b", title: "Second", order: 2 },
    ],
  });
  check(
    "sorted by order, then renumbered",
    sectionsFromTemplate(t).map((s) => [s.title, s.order]),
    [["First", 1], ["Second", 2], ["Third", 3]]
  );
}

console.log("\nEdge cases");
{
  check("an empty template yields nothing", sectionsFromTemplate(template({ sections: [] })), []);
  const blankWording = template({
    sections: [{ id: "s", title: "Only", staticContent: "", order: 1 }],
  });
  check("empty wording is an empty body", sectionsFromTemplate(blankWording)[0].body, "");
}

console.log("\nThe starter template is usable as offered");
{
  checkThat("it has sections", STARTER_TEMPLATE.length > 0);
  checkThat("every one has a title", STARTER_TEMPLATE.every((s) => !!s.title.trim()));
  checkThat(
    "attendance carries standing wording",
    !!STARTER_TEMPLATE.find((s) => s.title.includes("Attendance"))?.staticContent
  );
  checkThat(
    "previous minutes sign off carries standing wording",
    !!STARTER_TEMPLATE.find((s) => s.title.includes("Previous minutes"))?.staticContent
  );
  checkThat("no em dashes in the wording", STARTER_TEMPLATE.every((s) => !s.staticContent?.includes("—")));
}

console.log("\n\u{1F534} Section numbering, and where it starts");
{
  const s1 = { id: "a", title: "Attendance", order: 1 };
  const s2 = { id: "b", title: "Previous minutes", order: 2, numberingStartsHere: true };
  const s3 = { id: "c", title: "Finance", order: 3 };
  const s4 = { id: "d", title: "General", order: 4 };
  const n = sectionNumbers([s1, s2, s3, s4]);
  check("attendance is unnumbered", n.get("a"), null);
  check("numbering starts at 1 where flagged", n.get("b"), 1);
  check("and continues", [n.get("c"), n.get("d")], [2, 3]);

  // Nothing flagged: number everything. A school that never touches this
  // still gets numbered minutes, which is what the DoE expects to read.
  const none = sectionNumbers([s1, { ...s2, numberingStartsHere: false }, s3]);
  check("nothing flagged numbers from the top", [none.get("a"), none.get("b"), none.get("c")], [1, 2, 3]);

  // Two flags would restart the count and produce two number 1s.
  const two = sectionNumbers([
    { ...s1, numberingStartsHere: true },
    s2,
    { ...s3, numberingStartsHere: true },
  ]);
  check("two flags: the first wins", [two.get("a"), two.get("b"), two.get("c")], [1, 2, 3]);

  // Order, not array position, decides.
  const shuffled = sectionNumbers([s3, s1, s2]);
  check("respects order not array position", [shuffled.get("a"), shuffled.get("b"), shuffled.get("c")], [null, 1, 2]);

  check("flagged on the last section", sectionNumbers([s1, { ...s3, numberingStartsHere: true }]).get("c"), 1);
  check("an empty list is fine", sectionNumbers([]).size, 0);

  check("a numbered heading reads right", numberedTitle("Finance report", 3), "3. Finance report");
  check("an unnumbered heading is bare", numberedTitle("Attendance", null), "Attendance");
}

console.log("\nThe numbering flag survives the copy into minutes");
{
  const t = template({
    sections: [
      { id: "s1", title: "Attendance", staticContent: "Present:", order: 1 },
      { id: "s2", title: "Finance", order: 2, numberingStartsHere: true },
    ],
  });
  const copied = sectionsFromTemplate(t);
  check("the flag is carried across", copied[1].numberingStartsHere, true);
  check("and the one before it is not", copied[0].numberingStartsHere, undefined);
  // Which means the numbers match what the template editor showed.
  const n = sectionNumbers(copied);
  check("numbering matches the template", [n.get(copied[0].id), n.get(copied[1].id)], [null, 1]);
}
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
