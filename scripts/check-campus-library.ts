// Checks every ready-made Campus course: shape, 10 multiple-choice questions
// with exactly one right answer, Key points in every lesson, no dashes, unique
// slugs, and that each one becomes a publishable test.
//
//   npx tsx scripts/check-campus-library.ts
import assert from "node:assert/strict";
import { LIBRARY } from "../lib/campusLibrary/index";
import { libraryProblems } from "../lib/campusLibraryTypes";
import { cleanQuestion, testProblem, type Question } from "../lib/training";
import { MODULE_COLOURS } from "../lib/trainingTopics";

let bad = 0;
const slugs = new Set<string>();
for (const c of LIBRARY) {
  const problems = libraryProblems(c);
  if (slugs.has(c.slug)) problems.push("duplicate slug");
  slugs.add(c.slug);
  if (!(c.colour in MODULE_COLOURS)) problems.push(`unknown colour ${c.colour}`);
  const qs = c.test.questions.map((q) => cleanQuestion({ type: "single", points: 1, ...q })).filter((q): q is Question => q !== null);
  const tp = testProblem(qs);
  if (tp) problems.push(tp);
  if (problems.length) {
    bad++;
    console.log(`FAIL ${c.slug}: ${problems.join("; ")}`);
  } else console.log(`ok   ${c.slug} (${c.lessons.length} lessons, ${c.test.questions.length} questions)`);
}
assert.equal(bad, 0, `${bad} courses have problems`);
console.log(`campus library: ${LIBRARY.length} courses, all checks passed`);
