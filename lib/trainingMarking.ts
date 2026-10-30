// Copied from iRam Campus (src/lib/marking.ts), where 63 tests cover it. Keep the two in step.

export type QuestionType = "single" | "multi" | "truefalse" | "text";

export interface MarkableQuestion {
  id: string;
  type: string;
  points: number;
  acceptedAnswers: string[];
  caseSensitive: boolean;
  allowTypos: boolean;
  options: Array<{ id: string; isCorrect: boolean }>;
}

export interface MarkedAnswer {
  questionId: string;
  response: unknown;
  isCorrect: boolean;
  pointsAwarded: number;
}

/*
 * Characters listed by code point, never as literals.
 *
 * These are the characters that make a typed answer mark as wrong when it looks
 * exactly right on screen: they arrive invisibly when somebody pastes from Word,
 * from a PDF, or from a chat message. A literal character class of invisible
 * characters is impossible to read or review, and an editor or a copy-paste can
 * silently drop one, so the sets are built from numbers.
 */

/** Zero-width space, ZWNJ, ZWJ, word joiner, BOM / zero-width no-break space. */
const INVISIBLE = new Set([0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);

/** Non-breaking space, Ogham space, the en/em quad family, narrow and ideographic spaces. */
const EXOTIC_SPACES = new Set([
  0x00a0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009,
  0x200a, 0x202f, 0x205f, 0x3000,
]);

/** Curly and slanted apostrophes that a keyboard renders as a plain one. */
const APOSTROPHES = new Set([0x2018, 0x2019, 0x201b, 0x2032]);

/** Smart double quotes. */
const DOUBLE_QUOTES = new Set([0x201c, 0x201d, 0x201e, 0x2033]);

/** Hyphen, non-breaking hyphen, figure/en/em dash, horizontal bar, minus sign. */
const DASHES = new Set([0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2212]);

export function normaliseText(value: string, caseSensitive: boolean): string {
  let out = "";

  for (const character of value.normalize("NFKC")) {
    const code = character.codePointAt(0)!;

    if (INVISIBLE.has(code)) continue;
    if (EXOTIC_SPACES.has(code)) out += " ";
    else if (APOSTROPHES.has(code)) out += "'";
    else if (DOUBLE_QUOTES.has(code)) out += '"';
    else if (DASHES.has(code)) out += "-";
    else out += character;
  }

  const text = out.replace(/\s+/g, " ").trim();
  return caseSensitive ? text : text.toLowerCase();
}

/** Edit distance (insert, delete, change one letter), stopping early past `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

/**
 * How many letters a typed answer may be out by and still count. It cuts both
 * ways: a learner's spelling slip, or a slip in the memo itself. Short answers
 * stay exact ("yes" must not pass as "yet"), and so does anything with a digit
 * in it: 1500 is one letter from 1600 and a different answer.
 */
function typoAllowance(accepted: string): number {
  if (/\d/.test(accepted)) return 0;
  const letters = accepted.replace(/\s/g, "").length;
  if (letters <= 3) return 0;
  if (letters <= 7) return 1;
  return 2;
}

function asStringArray(response: unknown): string[] {
  if (Array.isArray(response)) return response.filter((r): r is string => typeof r === "string");
  if (typeof response === "string") return [response];
  return [];
}

export function markQuestion(question: MarkableQuestion, response: unknown): MarkedAnswer {
  const type = question.type as QuestionType;
  let isCorrect = false;

  if (type === "text") {
    const given = typeof response === "string" ? response : "";
    if (given.trim()) {
      const normalisedGiven = normaliseText(given, question.caseSensitive);
      isCorrect = question.acceptedAnswers.some((accepted) => {
        const normalisedAccepted = normaliseText(accepted, question.caseSensitive);
        if (normalisedAccepted === normalisedGiven) return true;
        // "Capital letters must match exactly" means exact: a capital is one edit.
        if (!question.allowTypos || question.caseSensitive) return false;
        // The first letter must match, or a negating prefix reads as a typo:
        // increase/decrease, accurate/inaccurate, available/unavailable.
        if (normalisedGiven[0] !== normalisedAccepted[0]) return false;
        const allowance = typoAllowance(normalisedAccepted);
        return (
          allowance > 0 &&
          editDistance(normalisedGiven, normalisedAccepted, allowance) <= allowance
        );
      });
    }
  } else {
    const chosen = new Set(asStringArray(response));
    const correct = new Set(question.options.filter((o) => o.isCorrect).map((o) => o.id));

    if (type === "multi") {
      // All or nothing, and deliberately so: half-marks for a partly-right answer
      // would make the pass mark mean something different question by question.
      isCorrect =
        correct.size > 0 &&
        chosen.size === correct.size &&
        [...correct].every((id) => chosen.has(id));
    } else {
      isCorrect = chosen.size === 1 && correct.has([...chosen][0]);
    }
  }

  return {
    questionId: question.id,
    response: response ?? null,
    isCorrect,
    pointsAwarded: isCorrect ? question.points : 0,
  };
}

export interface MarkedAttempt {
  answers: MarkedAnswer[];
  pointsAwarded: number;
  pointsPossible: number;
  scorePct: number;
  passed: boolean;
}

export function markAttempt(
  questions: MarkableQuestion[],
  responses: Record<string, unknown>,
  passMark: number,
): MarkedAttempt {
  // Every question is marked, including the ones left blank. Marking only what
  // was answered would score a half-finished paper as if it were complete.
  const answers = questions.map((q) => markQuestion(q, responses[q.id]));

  const pointsAwarded = answers.reduce((sum, a) => sum + a.pointsAwarded, 0);
  const pointsPossible = questions.reduce((sum, q) => sum + q.points, 0);

  // A paper worth nothing scores zero rather than dividing by zero. That can only
  // happen if every question carries 0 points, which is an authoring mistake.
  const scorePct = pointsPossible === 0 ? 0 : (pointsAwarded / pointsPossible) * 100;

  return {
    answers,
    pointsAwarded,
    pointsPossible,
    scorePct,
    passed: scorePct >= passMark,
  };
}
