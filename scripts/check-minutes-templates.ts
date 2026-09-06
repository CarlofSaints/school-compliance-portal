// Proves the template-to-minutes copy, with no server.
//
//   npx tsx scripts/check-minutes-templates.ts
//
// 🔴 The rule that matters: a template is COPIED into a set of minutes, never
// referenced. If minutes rendered live from a template, editing that template
// next year would silently rewrite what a meeting in 2026 appears to have
// discussed, and a SIGNED record would change under its own signatures.

import { sectionsFromTemplate, STARTER_TEMPLATE, type MinutesTemplate } from "../lib/minutes";

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
        personIds: ["p1"],
        order: 1,
      },
      { id: "s2", title: "Finance report", personIds: ["p2"], order: 2 },
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

console.log("\nPeople links stay on the template");
{
  const sections = sectionsFromTemplate(template());
  // A section records what was said, not who was meant to say it. The link is a
  // standing note for the secretary, so it does not belong on the minutes.
  checkThat(
    "no personIds leak into the minutes",
    sections.every((s) => !("personIds" in s))
  );
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

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
