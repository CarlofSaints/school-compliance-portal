// Campus in another language (lib/campusTranslation.ts): AI and library
// content is free, manual content is paid; a translation is applied by
// position and can change words but never which answer is right; editing the
// English retires the old translation.
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-campus-translation.ts
import assert from "node:assert/strict";
import { applyUnit, isFree, sameShape, saveTranslation, storedFor, translationsFor, unitHash, unitOf, type Unit } from "../lib/campusTranslation";
import { cleanQuestion, type Material, type Question, type Test } from "../lib/training";
import { stamp } from "../lib/trainingData";

(async () => {
  const q = cleanQuestion({ type: "text", text: "Which Act?", acceptedAnswers: ["SASA"], options: [] }) as Question;
  const mc = cleanQuestion({ type: "single", text: "SASA is Act?", explanation: "It is 84 of 1996", options: [{ text: "84 of 1996", isCorrect: true }, { text: "32 of 2024" }] }) as Question;
  const test: Test = { ...stamp("u", "ai"), title: "T", description: "d", status: "published", passMark: 50, maxAttempts: 0, showAnswers: true, questions: [mc, q] };
  const lesson: Material = { ...stamp("u", "manual"), title: "L", description: "", body: "## Hello", kind: "text", status: "published" };

  assert.equal(isFree("test", "ai"), true);
  assert.equal(isFree("material", "library"), true);
  assert.equal(isFree("material", "manual"), false, "manual content is paid");
  assert.equal(isFree("module", "manual"), true, "module headings are free");

  const zu: Unit = {
    title: "T-zu",
    description: "d-zu",
    body: "",
    questions: [
      // A translation that tries to move the right answer only changes words: isCorrect stays on option 0.
      { text: "SASA-zu?", options: ["84 ka 1996", "32 ka 2024"], explanation: "ex-zu" },
      { text: "Muphi uMthetho?", options: [], explanation: "" },
    ],
  };
  assert.ok(sameShape(unitOf("test", test), zu));
  const out = applyUnit("test", test, zu);
  assert.equal(out.questions[0].options[0].isCorrect, true, "memo comes from the English item only");
  assert.equal(out.questions[0].options[0].id, mc.options[0].id, "ids untouched");
  assert.equal(out.questions[0].text, "SASA-zu?");
  assert.deepEqual(out.questions[1].acceptedAnswers, ["SASA"], "typed answers are marked on the school's own English memo only");
  assert.equal(out.questions[1].explanation, q.explanation, "an empty translated explanation falls back to the English");
  assert.equal(out.passMark, 50, "settings untouched");

  const wrong = { ...zu, questions: [zu.questions[0]] };
  assert.equal(sameShape(unitOf("test", test), wrong), false, "a translation with a missing question is never used");

  await saveTranslation("zu", "test", test, zu);
  assert.ok(storedFor(await translationsFor("zu"), "test", test), "stored and found");
  const edited = { ...test, title: "T edited" };
  assert.equal(storedFor(await translationsFor("zu"), "test", edited), null, "editing the English retires the translation");
  assert.notEqual(unitHash(unitOf("test", test)), unitHash(unitOf("test", edited)));
  assert.equal(storedFor(await translationsFor("af"), "test", test), null, "one language never shows another's");
  assert.deepEqual(await translationsFor("en"), {}, "English needs nothing");

  const zuLesson: Unit = { title: "L-zu", description: "", body: "## Sawubona", questions: [] };
  assert.equal(applyUnit("material", lesson, zuLesson).body, "## Sawubona");
  console.log("campus translation: all checks passed");
})();
