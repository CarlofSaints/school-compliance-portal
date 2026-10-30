/**
 * Exercises the real marking engine — the same module the submit route imports,
 * not a copy of its logic. A copy pasted into a test drifts, and the drift is
 * invisible.
 *
 * Run: npx tsx scripts/check-training-marking.ts (copied from iRam Campus)
 */
import { markAttempt, markQuestion, normaliseText, type MarkableQuestion } from "../lib/trainingMarking";

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}\n       expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function q(overrides: Partial<MarkableQuestion>): MarkableQuestion {
  return {
    id: "q1",
    type: "single",
    points: 1,
    acceptedAnswers: [],
    caseSensitive: false,
    allowTypos: true, // the default every live question has
    options: [],
    ...overrides,
  };
}

console.log("\nSingle choice");
{
  const question = q({
    type: "single",
    options: [
      { id: "a", isCorrect: true },
      { id: "b", isCorrect: false },
    ],
  });
  check("right answer scores", markQuestion(question, ["a"]).isCorrect, true);
  check("wrong answer scores zero", markQuestion(question, ["b"]).pointsAwarded, 0);
  check("no answer is wrong", markQuestion(question, undefined).isCorrect, false);
  check("empty array is wrong", markQuestion(question, []).isCorrect, false);
  check("picking both is wrong", markQuestion(question, ["a", "b"]).isCorrect, false);
  check("a bare string still works", markQuestion(question, "a").isCorrect, true);
}

console.log("\nChoose several");
{
  const question = q({
    type: "multi",
    points: 2,
    options: [
      { id: "a", isCorrect: true },
      { id: "b", isCorrect: true },
      { id: "c", isCorrect: false },
    ],
  });
  check("both right scores full", markQuestion(question, ["a", "b"]).pointsAwarded, 2);
  check("order does not matter", markQuestion(question, ["b", "a"]).isCorrect, true);
  check("only one of two is wrong", markQuestion(question, ["a"]).isCorrect, false);
  check("right ones plus a wrong one is wrong", markQuestion(question, ["a", "b", "c"]).isCorrect, false);
  check("duplicates do not fake a full set", markQuestion(question, ["a", "a"]).isCorrect, false);
}

console.log("\nTyped answer");
{
  const question = q({ type: "text", acceptedAnswers: ["Fire extinguisher", "extinguisher"] });

  check("exact match", markQuestion(question, "Fire extinguisher").isCorrect, true);
  check("case is ignored by default", markQuestion(question, "FIRE EXTINGUISHER").isCorrect, true);
  check("surrounding spaces ignored", markQuestion(question, "  extinguisher  ").isCorrect, true);
  check("double spaces inside ignored", markQuestion(question, "Fire  extinguisher").isCorrect, true);
  check("a different answer is wrong", markQuestion(question, "hose").isCorrect, false);
  check("blank is wrong", markQuestion(question, "").isCorrect, false);
  check("whitespace only is wrong", markQuestion(question, "   ").isCorrect, false);

  // The reason this engine normalises at all: these strings LOOK identical to
  // the accepted answer on screen. Without normalisation each marks as wrong and
  // the learner cannot see why.
  check(
    "non-breaking space still matches",
    markQuestion(question, "Fire extinguisher").isCorrect,
    true,
  );
  check(
    "zero-width space alone is not a space (exact marking)",
    markQuestion({ ...question, allowTypos: false }, "Fire​extinguisher").isCorrect,
    false,
  );
  check(
    "a lost space is a spelling slip",
    markQuestion(question, "Fire​extinguisher").isCorrect,
    true,
  );
  check(
    "zero-width space between words still matches",
    markQuestion(question, "Fire ​extinguisher").isCorrect,
    true,
  );

  const cased = q({ type: "text", acceptedAnswers: ["ABC"], caseSensitive: true });
  check("case sensitive rejects wrong case", markQuestion(cased, "abc").isCorrect, false);
  check("case sensitive accepts right case", markQuestion(cased, "ABC").isCorrect, true);
}

console.log("\nApostrophes and dashes");
{
  const question = q({ type: "text", acceptedAnswers: ["don't stop", "twenty-one"] });
  check("curly apostrophe matches straight", markQuestion(question, "don’t stop").isCorrect, true);
  check("en dash matches hyphen", markQuestion(question, "twenty–one").isCorrect, true);
  check("em dash matches hyphen", markQuestion(question, "twenty—one").isCorrect, true);
}

console.log("\nnormaliseText directly");
{
  check("strips the BOM", normaliseText("﻿abc", false), "abc");
  check("collapses exotic spaces", normaliseText("a b", false), "a b");
  check("lowercases when not case sensitive", normaliseText("AbC", false), "abc");
  check("preserves case when case sensitive", normaliseText("AbC", true), "AbC");
}

console.log("\nWhole paper");
{
  const questions: MarkableQuestion[] = [
    q({ id: "q1", type: "single", points: 1, options: [{ id: "a", isCorrect: true }, { id: "b", isCorrect: false }] }),
    q({ id: "q2", type: "single", points: 1, options: [{ id: "c", isCorrect: true }, { id: "d", isCorrect: false }] }),
    q({ id: "q3", type: "text", points: 2, acceptedAnswers: ["yes"] }),
  ];

  const all = markAttempt(questions, { q1: ["a"], q2: ["c"], q3: "yes" }, 70);
  check("full marks", all.pointsAwarded, 4);
  check("full marks is 100%", Math.round(all.scorePct), 100);
  check("full marks passes", all.passed, true);

  const half = markAttempt(questions, { q1: ["a"], q2: ["d"], q3: "no" }, 70);
  check("partial score", half.pointsAwarded, 1);
  check("partial percentage", Math.round(half.scorePct), 25);
  check("below the pass mark fails", half.passed, false);

  // A blank paper must produce a real zero, not an empty result that reads as
  // "not marked yet".
  const blank = markAttempt(questions, {}, 70);
  check("blank paper scores zero", blank.pointsAwarded, 0);
  check("blank paper still marks every question", blank.answers.length, 3);
  check("blank paper does not pass", blank.passed, false);

  const exactly = markAttempt(questions, { q1: ["a"], q2: ["c"], q3: "no" }, 50);
  check("scoring exactly the pass mark passes", exactly.passed, true);

  const noMarks = markAttempt([q({ id: "z", points: 0, options: [{ id: "a", isCorrect: true }] })], {}, 70);
  check("a paper worth zero marks does not divide by zero", noMarks.scorePct, 0);
}

console.log("\nSpelling mistakes allowed");
{
  const typo = (accepted: string[], given: string, allowTypos = true) =>
    markQuestion(q({ type: "text", acceptedAnswers: accepted, allowTypos }), given).isCorrect;

  check("learner misspells by one letter", typo(["planogram"], "planagram"), true);
  check("memo misspelt, learner right", typo(["planagram"], "planogram"), true);
  check("two letters out on a long word", typo(["merchandiser"], "merchendisor"), true);
  check("three letters out is still wrong", typo(["merchandiser"], "murchendisor"), false);
  check("a missing letter counts", typo(["planogram"], "planogrm"), true);
  check("two out on a short word is wrong", typo(["stock"], "stak"), false);
  check("one out on a 5-letter word counts", typo(["stock"], "stok"), true);
  check("short answers stay exact", typo(["yes"], "yet"), false);
  check("numbers stay exact", typo(["1500"], "1600"), false);
  check("codes with digits stay exact", typo(["SKU123A"], "SKU123B"), false);
  check("setting off means exact", typo(["planogram"], "planagram", false), false);
  check("blank is still wrong", typo(["planogram"], "  "), false);
  check("any one memo line can match", typo(["shelf plan", "planogram"], "planogran"), true);
  check("a different word is still wrong", typo(["planogram"], "promotion"), false);
  check("an opposite is not a typo (increase)", typo(["increase"], "decrease"), false);
  check("an opposite is not a typo (inaccurate)", typo(["inaccurate"], "accurate"), false);
  check("an opposite is not a typo (unavailable)", typo(["unavailable"], "available"), false);
  check("an opposite is not a typo (incorrect)", typo(["incorrect"], "correct"), false);
  const cased = (given: string) =>
    markQuestion(q({ type: "text", acceptedAnswers: ["McDonald"], caseSensitive: true }), given).isCorrect;
  check("capitals-must-match stays exact on capitals", cased("Mcdonald"), false);
  check("capitals-must-match stays exact on spelling", cased("McDonnald"), false);
  check("capitals-must-match still takes the exact answer", cased("McDonald"), true);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
