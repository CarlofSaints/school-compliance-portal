import {
  attemptsAt,
  deadlineFor,
  isLocked,
  liveKeys,
  paperFor,
  readingMinutes,
  submitAttempt,
  TIME_GRACE_MS,
  type Attempt,
  type ModuleItem,
  type Progress,
  type TrainingStatus,
} from "./training";
import { getMaterial, getMaterials, getModules, getProgress, getTest, getTests, markOpened, readMaterialFile, recordAttempt, startSitting } from "./trainingData";

import { afterResponse } from "./activityActor";
import { creditsFor, maySpendCredits, textPages } from "./contentTranslation";
import { applyUnit, isFree, readerLocale, storedFor, translateMissingFree, translationsFor, unitOf, type CampusKind, type TranslationState } from "./campusTranslation";
import type { Material, Test } from "./training";

// ---------------------------------------------------------------------------
// What a LEARNER does on Campus (open a lesson, sit a paper, hand it in), in
// one place, so a portal user and a guest who came in through a share link go
// through exactly the same rules: drafts hidden, module locks, time limits,
// attempt limits, and the memo held back until a pass or the last attempt.
//
// A learner is whoever's progress file is being written: a portal user (their
// user id) or a guest ("guest-<id>"). A guest also carries a SCOPE: only the
// pieces their link covers. Routes turn the Result into a response.
// ---------------------------------------------------------------------------

export interface Learner {
  progressId: string;
  /** Builds training: sees drafts and is never locked out of a step. */
  manager: boolean;
  /** "material:<id>" / "test:<id>" this learner may open; undefined = all published training. */
  scope?: Set<string>;
  /**
   * For a guest: the only modules whose order applies (a module link: that
   * module; a single-piece link: none). Without this a guest could be held
   * behind a step outside their link, which they can never open.
   */
  lockModules?: string[];
}

export type Fail = { ok: false; status: number; error: string };
export type Result<T = unknown> = { ok: true; body: T } | Fail;
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

/** May this learner open this piece? Null means yes. */
async function gate(learner: Learner, item: (ModuleItem & { status: TrainingStatus }) | null, progress: Progress): Promise<Fail | null> {
  if (!item || (item.status !== "published" && !learner.manager)) return fail(404, "Not found");
  if (learner.scope && !learner.scope.has(`${item.kind}:${item.id}`)) return fail(404, "Not found");
  if (learner.manager) return null;
  const [all, materials, tests] = await Promise.all([getModules(), getMaterials(), getTests()]);
  const modules = learner.lockModules ? all.filter((m) => learner.lockModules!.includes(m.id)) : all;
  return isLocked(progress, modules, item, liveKeys(materials, tests)) ? fail(403, "Finish the earlier steps of this module first.") : null;
}

/**
 * The item in the reader's language (lib/campusTranslation.ts): the stored
 * translation if there is one; otherwise free AI content is translated in the
 * background and shows in English this once, and manual content says what it
 * would cost and whether this reader may spend the school's credits on it.
 */
async function inReaderLanguage<T extends Material | Test>(learner: Learner, kind: CampusKind, item: T): Promise<{ item: T; translation: TranslationState & { canSpend?: boolean } }> {
  const locale = await readerLocale();
  if (locale === "en") return { item, translation: { state: "english" } };
  const unit = storedFor(await translationsFor(locale), kind, item);
  if (unit) return { item: applyUnit(kind, item, unit), translation: { state: "translated" } };
  // A draft is not translated: every edit would pay for a translation nobody reads until it is published.
  if (item.status !== "published") return { item, translation: { state: "english" } };
  // An uploaded document cannot be translated here, so it is not offered for credits.
  if (kind === "material" && (item as Material).kind === "file" && !isFree(kind, item.source)) return { item, translation: { state: "english" } };
  if (isFree(kind, item.source)) {
    await afterResponse(() => translateMissingFree(locale, [{ kind, item }]));
    return { item, translation: { state: "pending" } };
  }
  const canSpend = !learner.progressId.startsWith("guest-") && (await maySpendCredits(learner.progressId));
  return { item, translation: { state: "paid", credits: creditsFor(textPages(JSON.stringify(unitOf(kind, item)))), canSpend } };
}

/** A lesson, recorded as read the first time it is opened (unless only being looked at to edit). */
export async function openMaterial(learner: Learner, id: string, markRead = true) {
  const material = await getMaterial(id);
  const blocked = await gate(learner, material && { kind: "material", id, status: material.status }, await getProgress(learner.progressId));
  if (blocked) return blocked;
  if (markRead) await markOpened(learner.progressId, id);
  // The editor (markRead false) always gets the English it edits.
  if (!markRead) return { ok: true as const, body: { ...material!, minutes: readingMinutes(material!) } };
  const { item, translation } = await inReaderLanguage(learner, "material", material!);
  return { ok: true as const, body: { ...item, minutes: readingMinutes(material!), translation } };
}

export async function materialFile(learner: Learner, id: string): Promise<Result<{ bytes: Buffer; filename: string; ext: string }>> {
  const material = await getMaterial(id);
  const blocked = await gate(learner, material && { kind: "material", id, status: material.status }, await getProgress(learner.progressId));
  if (blocked) return blocked;
  if (!material?.file) return fail(404, "This material has no document.");
  const bytes = await readMaterialFile(id, material.file.ext);
  if (!bytes) return fail(404, "The document is missing from storage.");
  await markOpened(learner.progressId, id);
  return { ok: true, body: { bytes, filename: material.file.filename, ext: material.file.ext } };
}

/**
 * The paper WITHOUT its memo, plus this learner's attempts. A timed paper left
 * to run out is handed in blank first; then the clock starts (or carries on
 * after a reload) for this opening.
 */
export async function openPaper(learner: Learner, id: string) {
  const test = await getTest(id);
  let progress = await getProgress(learner.progressId);
  const blocked = await gate(learner, test && { kind: "test", id, status: test.status }, progress);
  if (blocked || !test) return blocked!;
  let deadline: number | null = null;
  if (test.timeLimitMinutes) {
    const old = deadlineFor(test, progress);
    if (old !== null && Date.now() > old + TIME_GRACE_MS) {
      await recordAttempt(learner.progressId, (p) => submitAttempt(test, p, {}, new Date().toISOString()));
      progress = await getProgress(learner.progressId);
    }
    if (test.maxAttempts === 0 || attemptsAt(progress, id).length < test.maxAttempts) {
      progress = await startSitting(learner.progressId, id);
      deadline = deadlineFor(test, progress);
    }
  }
  const attempts = attemptsAt(progress, id).map((a) => ({ id: a.id, submittedAt: a.submittedAt, scorePct: a.scorePct, passed: a.passed }));
  // Translated BEFORE paperFor, so the memo is stripped from the translated paper exactly as from the English.
  const { item, translation } = await inReaderLanguage(learner, "test", test);
  return { ok: true as const, body: { ...paperFor(item), attempts, deadline: deadline ? new Date(deadline).toISOString() : null, translation } };
}

/**
 * Hands in a paper: marked here against the stored memo. The right answers are
 * shown only once they can no longer be copied into another attempt: after a
 * pass, or after the last attempt. Before that the learner sees WHICH
 * questions were wrong, not the answers.
 */
export async function handIn(learner: Learner, id: string, responses: Record<string, unknown>) {
  const test = await getTest(id);
  // Marked on the school's own English memo; only the explanations shown afterwards are in the reader's language.
  const locale = await readerLocale();
  const unit = test && locale !== "en" ? storedFor(await translationsFor(locale), "test", test) : null;
  const shown = test && unit ? applyUnit("test", test, unit) : test;
  const before = await getProgress(learner.progressId);
  const blocked = await gate(learner, test && { kind: "test", id, status: test.status }, before);
  if (blocked || !test) return blocked!;
  const deadline = deadlineFor(test, before);
  const timedOut = deadline !== null && Date.now() > deadline + TIME_GRACE_MS;

  let usedBefore = 0;
  const attempt = await recordAttempt(learner.progressId, (p) => {
    usedBefore = attemptsAt(p, id).length;
    return submitAttempt(test, p, responses, new Date().toISOString());
  });
  if (attempt === "no_attempts_left") return fail(409, "You have used all your attempts at this test.");

  const reveal = test.showAnswers && (attempt.passed || (test.maxAttempts > 0 && usedBefore + 1 >= test.maxAttempts));
  const memo = test.showAnswers
    ? test.questions.map((q) => {
        const mine = attempt.answers.find((a) => a.questionId === q.id);
        return {
          questionId: q.id,
          isCorrect: mine?.isCorrect ?? false,
          correctOptionIds: reveal ? q.options.filter((o) => o.isCorrect).map((o) => o.id) : [],
          acceptedAnswers: reveal ? q.acceptedAnswers : [],
          explanation: reveal ? shown!.questions.find((x) => x.id === q.id)?.explanation ?? q.explanation : "",
        };
      })
    : null;
  return {
    ok: true as const,
    test,
    attempt: attempt as Attempt,
    body: {
      scorePct: attempt.scorePct,
      passed: attempt.passed,
      pointsAwarded: attempt.pointsAwarded,
      pointsPossible: attempt.pointsPossible,
      passMark: test.passMark,
      answersShown: reveal,
      timedOut,
      memo,
    },
  };
}
