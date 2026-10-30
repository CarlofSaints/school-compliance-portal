// Checks the training rules: question cleaning, publish checks, module locks,
// attempt limits, the memo never reaching a learner, and the leaderboard.
// No server, no blob.
//
//   npx tsx scripts/check-training.ts
import assert from "node:assert/strict";
import {
  buildLeaderboard,
  cleanModuleFields,
  cleanQuestion,
  emptyProgress,
  isLocked,
  paperFor,
  submitAttempt,
  testProblem,
  type Test,
  type TrainingModule,
} from "../lib/training";

const now = "2026-10-30T10:00:00.000Z";
const base = { description: "", source: "manual" as const, createdBy: "u", createdAt: now, updatedAt: now };

// Cleaning
const single = cleanQuestion({ type: "single", text: "Who may expel?", options: [{ text: "Principal", isCorrect: true }, { text: "HOD", isCorrect: true }, { text: "" }] })!;
assert.equal(single.options.length, 2, "blank option dropped");
assert.deepEqual(single.options.map((o) => o.isCorrect), [true, false], "single choice keeps ONE right answer");
const tf = cleanQuestion({ type: "truefalse", text: "SASA applies", options: [{ text: "True", isCorrect: false }, { text: "False", isCorrect: true }] })!;
assert.deepEqual(tf.options.map((o) => [o.text, o.isCorrect]), [["True", false], ["False", true]]);
assert.equal(cleanQuestion({ type: "text", text: "  " }), null, "a question with no text is dropped");
const kept = cleanQuestion({ id: "q-keep", type: "text", text: "Act number?", acceptedAnswers: ["84", ""] })!;
assert.equal(kept.id, "q-keep", "ids are kept so a save never breaks a paper being sat");
assert.deepEqual(kept.acceptedAnswers, ["84"]);
assert.equal(testProblem([]), "Add at least one question before publishing.");
assert.match(testProblem([cleanQuestion({ type: "single", text: "x", options: [{ text: "a" }, { text: "b" }] })!])!, /no correct answer/);
assert.equal(testProblem([single, tf, kept]), null);
assert.equal(cleanModuleFields({ title: "M", items: [{ kind: "test", id: "a" }, { kind: "test", id: "a" }, { kind: "x", id: "b" }] }).items.length, 1, "duplicates and junk steps dropped");

// Tests and attempts
const test: Test = { ...base, id: "t1", title: "SASA", status: "published", passMark: 70, maxAttempts: 2, showAnswers: true, questions: [single, tf] };
const paper = paperFor(test);
assert.ok(!JSON.stringify(paper).includes("isCorrect"), "the paper carries no memo");
const p = emptyProgress("u1");
const right = { [single.id]: single.options[0].id, [tf.id]: tf.options[1].id };
const a1 = submitAttempt(test, p, { [single.id]: single.options[1].id }, now);
assert.ok(a1 !== "no_attempts_left" && a1.scorePct === 0 && !a1.passed, "blank question marked wrong");
p.attempts.push(a1 as never);
const a2 = submitAttempt(test, p, right, now);
assert.ok(a2 !== "no_attempts_left" && a2.scorePct === 100 && a2.passed);
p.attempts.push(a2 as never);
assert.equal(submitAttempt(test, p, right, now), "no_attempts_left", "third attempt refused at max 2");

// Module locks
const mod: TrainingModule = { ...base, id: "m1", title: "M", topic: "", status: "published", sequential: true, items: [{ kind: "material", id: "l1" }, { kind: "test", id: "t1" }] };
const fresh = emptyProgress("u2");
assert.equal(isLocked(fresh, [mod], { kind: "material", id: "l1" }), false, "first step open");
assert.equal(isLocked(fresh, [mod], { kind: "test", id: "t1" }), true, "test locked until the lesson is read");
fresh.opened.l1 = now;
assert.equal(isLocked(fresh, [mod], { kind: "test", id: "t1" }), false);
assert.equal(isLocked(emptyProgress("x"), [{ ...mod, sequential: false }], { kind: "test", id: "t1" }), false, "no lock when not in order");
assert.equal(isLocked(emptyProgress("x"), [{ ...mod, status: "draft" }], { kind: "test", id: "t1" }), false, "a draft module locks nothing");

// Leaderboard
const users = [
  { id: "u1", name: "Ann", surname: "A" },
  { id: "u2", name: "Ben", surname: "B" },
  { id: "u3", name: "Cat", surname: "C" },
];
const draftTest: Test = { ...test, id: "t2", status: "draft" };
const progress = new Map([
  ["u1", p],
  ["u2", { ...emptyProgress("u2"), opened: { l1: now }, attempts: [{ ...(a2 as never as object), testId: "t2" } as never] }],
]);
const rows = buildLeaderboard(users, progress, [test, draftTest], [mod]);
assert.deepEqual(rows.map((r) => r.name), ["Ann A", "Ben B", "Cat C"], "everybody listed, best first");
assert.equal(rows[0].points, 100, "best attempt counts, not the sum of attempts");
assert.equal(rows[0].testsPassed, 1);
assert.equal(rows[1].points, 0, "a draft test's score does not count");
assert.equal(rows[0].modulesCompleted, 0, "module needs every step: Ann never opened the lesson");
assert.equal(rows[1].rank, rows[2].rank, "equal scores share a place");
assert.equal(rows[2].lastActivity, null);

console.log("training: all checks passed");
