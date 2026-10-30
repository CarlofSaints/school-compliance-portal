import { randomUUID } from "crypto";
import { markAttempt, type MarkedAnswer, type QuestionType } from "./trainingMarking";

// ---------------------------------------------------------------------------
// Training: material, tests and modules, ported from iRam Campus onto this
// portal's Blob store. Pure (no storage), so scripts/check-training.ts can
// test it. Storage is lib/trainingData.ts.
//
// Rules carried over from Campus:
// - A module is a grouping, never a store of progress. Done is read from the
//   pieces (material opened, test PASSED), so deleting a module loses nobody's
//   history.
// - In a module set to run in order, a piece is locked until the ones before
//   it are done, and the lock is enforced on the server, not just hidden.
// - The memo (correct answers) never leaves the server before a paper is
//   handed in.
// ---------------------------------------------------------------------------

export type TrainingStatus = "draft" | "published";
export type TrainingSource = "manual" | "ai";

interface Stamped {
  id: string;
  title: string;
  description: string;
  status: TrainingStatus;
  source: TrainingSource;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Material extends Stamped {
  /** "text" is written in the portal (or by AI); "file" is an uploaded document. */
  kind: "text" | "file";
  body: string;
  file?: { filename: string; ext: string; size: number };
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  points: number;
  options: { id: string; text: string; isCorrect: boolean }[];
  /** Typed-answer questions only. */
  acceptedAnswers: string[];
  caseSensitive: boolean;
  allowTypos: boolean;
  explanation: string;
}

export interface Test extends Stamped {
  passMark: number;
  /** 0 = unlimited. */
  maxAttempts: number;
  showAnswers: boolean;
  questions: Question[];
}

export interface ModuleItem {
  kind: "material" | "test";
  id: string;
}

export interface TrainingModule extends Stamped {
  topic: string;
  sequential: boolean;
  items: ModuleItem[];
}

export interface Attempt {
  id: string;
  testId: string;
  submittedAt: string;
  pointsAwarded: number;
  pointsPossible: number;
  scorePct: number;
  passed: boolean;
  answers: MarkedAnswer[];
}

/** One per user, written only by that user, so nobody's result can overwrite another's. */
export interface Progress {
  userId: string;
  opened: Record<string, string>; // materialId -> first opened
  attempts: Attempt[];
}

export const emptyProgress = (userId: string): Progress => ({ userId, opened: {}, attempts: [] });

// --- Cleaning what an editor (or the AI) sends ------------------------------

export const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const int = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};
const TYPES: QuestionType[] = ["single", "multi", "truefalse", "text"];
const status = (v: unknown): TrainingStatus => (v === "published" ? "published" : "draft");

/** A question as it may be stored. Ids are kept when they are sent, so saving never breaks a paper someone is sitting. */
export function cleanQuestion(raw: unknown): Question | null {
  const q = (raw ?? {}) as Record<string, unknown>;
  const type = TYPES.includes(q.type as QuestionType) ? (q.type as QuestionType) : "single";
  const text = str(q.text, 2000);
  if (!text) return null;
  let options =
    type === "text"
      ? []
      : (Array.isArray(q.options) ? q.options : [])
          .map((o) => {
            const r = (o ?? {}) as Record<string, unknown>;
            return { id: str(r.id, 64) || randomUUID(), text: str(r.text, 500), isCorrect: r.isCorrect === true };
          })
          .filter((o) => o.text)
          .slice(0, 10);
  if (type === "truefalse") {
    const trueCorrect = options.find((o) => /^true$/i.test(o.text))?.isCorrect ?? options[0]?.isCorrect ?? true;
    options = [
      { id: options[0]?.id || randomUUID(), text: "True", isCorrect: trueCorrect },
      { id: options[1]?.id || randomUUID(), text: "False", isCorrect: !trueCorrect },
    ];
  }
  // One right answer for single choice: the first ticked one wins.
  if (type === "single") {
    const first = options.findIndex((o) => o.isCorrect);
    options = options.map((o, i) => ({ ...o, isCorrect: i === first }));
  }
  return {
    id: str(q.id, 64) || randomUUID(),
    type,
    text,
    points: int(q.points, 0, 100, 1),
    options,
    acceptedAnswers:
      type === "text"
        ? (Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : []).map((a) => str(a, 300)).filter(Boolean).slice(0, 20)
        : [],
    caseSensitive: q.caseSensitive === true,
    allowTypos: q.allowTypos !== false,
    explanation: str(q.explanation, 2000),
  };
}

/** Why a test cannot be published yet, or null. A paper nobody can pass must not go out. */
export function testProblem(questions: Question[]): string | null {
  if (questions.length === 0) return "Add at least one question before publishing.";
  // A paper worth nothing scores 0% for everyone, so nobody could ever pass it.
  if (questions.every((q) => q.points <= 0)) return "Give at least one question some points.";
  for (const [i, q] of questions.entries()) {
    if (q.type === "text" ? q.acceptedAnswers.length === 0 : !q.options.some((o) => o.isCorrect)) {
      return `Question ${i + 1} has no correct answer.`;
    }
    if ((q.type === "single" || q.type === "multi") && q.options.length < 2) {
      return `Question ${i + 1} needs at least two options.`;
    }
  }
  return null;
}

export function cleanTestFields(raw: Record<string, unknown>) {
  return {
    title: str(raw.title, 200),
    description: str(raw.description, 2000),
    status: status(raw.status),
    passMark: int(raw.passMark, 0, 100, 70),
    maxAttempts: int(raw.maxAttempts, 0, 50, 0),
    showAnswers: raw.showAnswers !== false,
    questions: (Array.isArray(raw.questions) ? raw.questions : [])
      .map(cleanQuestion)
      .filter((q): q is Question => q !== null)
      .slice(0, 200),
  };
}

export function cleanMaterialFields(raw: Record<string, unknown>) {
  return {
    title: str(raw.title, 200),
    description: str(raw.description, 2000),
    status: status(raw.status),
    body: str(raw.body, 200_000),
  };
}

export function cleanModuleFields(raw: Record<string, unknown>) {
  const seen = new Set<string>();
  return {
    title: str(raw.title, 200),
    description: str(raw.description, 2000),
    topic: str(raw.topic, 200),
    status: status(raw.status),
    sequential: raw.sequential === true,
    items: (Array.isArray(raw.items) ? raw.items : [])
      .map((i) => (i ?? {}) as Record<string, unknown>)
      .filter((i) => (i.kind === "material" || i.kind === "test") && typeof i.id === "string")
      .map((i) => ({ kind: i.kind as ModuleItem["kind"], id: str(i.id, 64) }))
      .filter((i) => !seen.has(`${i.kind}:${i.id}`) && seen.add(`${i.kind}:${i.id}`))
      .slice(0, 100),
  };
}

// --- What a learner may see --------------------------------------------------

/** The paper without its memo. */
export function paperFor(test: Test) {
  return {
    ...test,
    questions: test.questions.map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      points: q.points,
      options: q.options.map((o) => ({ id: o.id, text: o.text })),
    })),
  };
}

export const attemptsAt = (p: Progress, testId: string) => p.attempts.filter((a) => a.testId === testId);
export const hasPassed = (p: Progress, testId: string) => attemptsAt(p, testId).some((a) => a.passed);

export function itemDone(p: Progress, item: ModuleItem): boolean {
  return item.kind === "material" ? Boolean(p.opened[item.id]) : hasPassed(p, item.id);
}

/** "material:<id>" / "test:<id>" of every published piece. */
export const liveKeys = (materials: { id: string; status: string }[], tests: { id: string; status: string }[]) =>
  new Set([
    ...materials.filter((m) => m.status === "published").map((m) => `material:${m.id}`),
    ...tests.filter((t) => t.status === "published").map((t) => `test:${t.id}`),
  ]);

/**
 * Whether a piece is locked for this person: it sits in a PUBLISHED module set
 * to run in order and a PUBLISHED step before it there is not done. Any one
 * such module is enough to lock it. A step taken back to draft (or deleted)
 * no longer counts: a learner cannot open it, so it must not hold the rest
 * shut for ever.
 */
export function isLocked(p: Progress, modules: TrainingModule[], item: ModuleItem, live: Set<string>): boolean {
  return modules.some((m) => {
    if (m.status !== "published" || !m.sequential) return false;
    const at = m.items.findIndex((i) => i.kind === item.kind && i.id === item.id);
    return at > 0 && m.items.slice(0, at).some((i) => live.has(`${i.kind}:${i.id}`) && !itemDone(p, i));
  });
}

/** Only what the paper asked, in the shape each question takes, so a hand-in cannot bloat the store. */
export function cleanResponses(test: Test, raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const q of test.questions) {
    const v = raw[q.id];
    if (q.type === "text") out[q.id] = str(v, 1000);
    else if (q.type === "multi") out[q.id] = (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string").slice(0, 20).map((x) => x.slice(0, 64));
    else out[q.id] = typeof v === "string" ? v.slice(0, 64) : null;
  }
  return out;
}

/** Most attempts kept per test when the test itself sets no limit. */
export const MAX_STORED_ATTEMPTS = 100;

/** Marks a paper and returns the attempt to store. Refuses once attempts are used up. */
export function submitAttempt(test: Test, p: Progress, responses: Record<string, unknown>, now: string): Attempt | "no_attempts_left" {
  const used = attemptsAt(p, test.id).length;
  if ((test.maxAttempts > 0 && used >= test.maxAttempts) || used >= MAX_STORED_ATTEMPTS) return "no_attempts_left";
  const marked = markAttempt(test.questions, cleanResponses(test, responses), test.passMark);
  // Rounded DOWN and passed decided on the same figure, so "70%" never sits beside "Not passed".
  const scorePct = Math.floor(marked.scorePct);
  return {
    id: randomUUID(),
    testId: test.id,
    submittedAt: now,
    pointsAwarded: marked.pointsAwarded,
    pointsPossible: marked.pointsPossible,
    scorePct,
    passed: scorePct >= test.passMark,
    answers: marked.answers,
  };
}

// --- The leaderboard ---------------------------------------------------------

export interface LeaderRow {
  userId: string;
  name: string;
  rank: number;
  /** Best score on every published test, added up: each test is worth up to 100. */
  points: number;
  testsPassed: number;
  testsTaken: number;
  modulesCompleted: number;
  averagePct: number | null;
  lastActivity: string | null;
}

/**
 * EVERY user, including those who have done nothing yet (a board of only the
 * people who took part cannot show who has not). Only published tests and
 * modules count, so a draft or a deleted test never moves anyone.
 */
export function buildLeaderboard(
  users: { id: string; name: string; surname: string }[],
  progress: Map<string, Progress>,
  tests: Test[],
  modules: TrainingModule[],
  materials: { id: string; status: string }[]
): LeaderRow[] {
  const live = new Set(tests.filter((t) => t.status === "published").map((t) => t.id));
  const steps = liveKeys(materials, tests);
  // A module is complete when every PUBLISHED step is done (same rule as the lock).
  const liveModules = modules
    .filter((m) => m.status === "published")
    .map((m) => ({ ...m, items: m.items.filter((i) => steps.has(`${i.kind}:${i.id}`)) }))
    .filter((m) => m.items.length > 0);
  const rows = users.map((u) => {
    const p = progress.get(u.id) ?? emptyProgress(u.id);
    const best = new Map<string, number>();
    for (const a of p.attempts) {
      if (live.has(a.testId)) best.set(a.testId, Math.max(best.get(a.testId) ?? 0, a.scorePct));
    }
    const scores = [...best.values()];
    const stamps = [...p.attempts.map((a) => a.submittedAt), ...Object.values(p.opened)].sort();
    return {
      userId: u.id,
      name: `${u.name} ${u.surname}`.trim(),
      rank: 0,
      points: scores.reduce((s, x) => s + x, 0),
      testsPassed: [...live].filter((id) => hasPassed(p, id)).length,
      testsTaken: best.size,
      modulesCompleted: liveModules.filter((m) => m.items.every((i) => itemDone(p, i))).length,
      averagePct: scores.length ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length) : null,
      lastActivity: stamps.at(-1) ?? null,
    };
  });
  rows.sort((a, b) => b.points - a.points || b.testsPassed - a.testsPassed || a.name.localeCompare(b.name));
  // Equal points and passes share a place (1, 2, 2, 4).
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.rank = prev && prev.points === r.points && prev.testsPassed === r.testsPassed ? prev.rank : i + 1;
  });
  return rows;
}

/** Documents that may be uploaded as material. */
export const MATERIAL_EXT = ["pdf", "docx", "doc", "pptx", "xlsx", "txt", "jpg", "jpeg", "png"];
