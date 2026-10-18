import Anthropic from "@anthropic-ai/sdk";
import { readJson, writeJson, updateJson, NO_CHANGE } from "./controlData";
import { LOCALES, type Locale } from "./i18n/locales";

// ---------------------------------------------------------------------------
// Translating a SCHOOL'S OWN content (a policy, a set of minutes) into the
// visitor's language. Paid with translation CREDITS the school buys
// (R100 for 10, never expire). Carl adds them on /platform/<key>.
//
// The site's own buttons and labels are NOT this: those are stored
// dictionaries (lib/i18n). This is for text the school wrote, which no
// dictionary can know in advance.
//
// 🔴 Translated ONCE per document version per language, then stored. Every
// later reader of that version in that language gets the stored copy and
// costs nothing. A new policy version or an edited set of minutes changes the
// source hash, so the next request translates again (and costs again).
//
// All storage goes through controlData, which is already scoped to the
// current school, so one school's translations and credits never reach another.
// ---------------------------------------------------------------------------

import { PAGES_PER_CREDIT } from "./creditPack";
export { CREDIT_PACK, PAGES_PER_CREDIT } from "./creditPack";

/** A long document costs more: one credit per started block of 10 pages. */
export function creditsFor(pages: number): number {
  return Math.max(1, Math.ceil(pages / PAGES_PER_CREDIT));
}

// Roughly one printed page of plain text.
const CHARS_PER_PAGE = 3000;
export const textPages = (text: string) => Math.max(1, Math.ceil(text.length / CHARS_PER_PAGE));

/**
 * Pages in a PDF: the /Count on its page tree (the root holds the largest).
 * Not the page objects themselves, which re-saved PDFs keep stale copies of.
 * A PDF that hides its page tree inside compressed object streams has no
 * readable /Count, so that one falls back to the model's own token count
 * (free to ask) at about 2,000 tokens a page.
 */
export async function pdfPages(file: Buffer): Promise<number> {
  const raw = file.toString("latin1");
  const counts = [
    ...raw.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g),
  ].map((m) => Number(m[1] || m[2]));
  const counted = Math.max(0, ...counts);
  if (counted > 0) return counted;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const { input_tokens } = await new Anthropic({ apiKey }).messages.countTokens({
    model: MODEL,
    messages: [{ role: "user", content: [pdfBlock(file)] }],
  });
  return Math.max(1, Math.ceil(input_tokens / 2000));
}

export const pdfBlock = (file: Buffer): Anthropic.ContentBlockParam => ({
  type: "document",
  source: { type: "base64", media_type: "application/pdf", data: file.toString("base64") },
});

const MODEL = "claude-opus-5-5";

interface Credits {
  balance: number;
  updatedAt?: string;
}

const CREDITS_PATH = "settings/translation-credits.json";

export async function getCredits(): Promise<number> {
  return (await readJson<Credits>(CREDITS_PATH, { balance: 0 })).balance;
}

/** Carl's top-up (or correction, when negative). Never below 0. The new
 *  balance, and how many credits actually moved (a correction larger than
 *  the balance only removes what is there). */
export async function addCredits(n: number): Promise<{ balance: number; applied: number }> {
  let balance = 0;
  let applied = 0;
  await updateJson<Credits>(CREDITS_PATH, { balance: 0 }, (c) => {
    balance = Math.max(0, c.balance + n);
    applied = balance - c.balance;
    return { balance, updatedAt: new Date().toISOString() };
  });
  return { balance, applied };
}

/** Takes n credits, atomically. False when the school has fewer. */
async function spend(n: number): Promise<boolean> {
  let ok = false;
  await updateJson<Credits>(CREDITS_PATH, { balance: 0 }, (c) => {
    if (c.balance < n) return NO_CHANGE;
    ok = true;
    return { balance: c.balance - n, updatedAt: new Date().toISOString() };
  });
  return ok;
}

export type ContentKind = "policy" | "minutes";

interface StoredTranslation {
  sourceHash: string;
  text: string;
  translatedAt: string;
}

export type TranslateOutcome =
  | { ok: true; text: string; translatedAt: string; fromStore: boolean }
  | { ok: false; status: number; error: string };

const storePath = (kind: ContentKind, id: string, locale: Locale) =>
  `translations/${kind}/${id}/${locale}.json`;

/** The stored copy for exactly this source, or null. Free: no AI, no credits. */
export async function storedTranslation(
  kind: ContentKind,
  id: string,
  locale: Locale,
  sourceHash: string
): Promise<Extract<TranslateOutcome, { ok: true }> | null> {
  const stored = await readJson<StoredTranslation | null>(storePath(kind, id, locale), null);
  return stored && stored.sourceHash === sourceHash
    ? { ok: true, text: stored.text, translatedAt: stored.translatedAt, fromStore: true }
    : null;
}

/**
 * The stored translation if there is one for this exact source, otherwise a
 * new one, paid with `credits` (the route quotes them first from the page
 * count). Failed translations give the credits back.
 */
export async function translateContent(opts: {
  kind: ContentKind;
  id: string;
  locale: Locale;
  sourceHash: string;
  title: string;
  credits: number;
  content: Anthropic.ContentBlockParam[];
  /** Epoch ms by which the model must have finished, so the refund below
   *  still runs before the platform kills the request. */
  deadline: number;
}): Promise<TranslateOutcome> {
  const { kind, id, locale, sourceHash } = opts;
  if (locale === "en") return { ok: false, status: 400, error: "Pick a language other than English first." };

  const stored = await storedTranslation(kind, id, locale, sourceHash);
  if (stored) return stored;

  // One translation of a document at a time: a second click, or a colleague
  // opening the same minutes, must not pay twice for the same text.
  if (!(await claimInFlight(kind, id, locale))) {
    return { ok: false, status: 409, error: "This document is being translated right now. Try again in a minute or two." };
  }
  try {
    return await translateClaimed(opts);
  } finally {
    await writeJson(inFlightPath(kind, id, locale), null).catch(() => {});
  }
}

const inFlightPath = (kind: ContentKind, id: string, locale: Locale) =>
  `translations/${kind}/${id}/${locale}.inflight.json`;
// Longer than the function's own time limit, so a killed run frees the claim.
const IN_FLIGHT_MS = 15 * 60_000;

async function claimInFlight(kind: ContentKind, id: string, locale: Locale): Promise<boolean> {
  let ok = false;
  await updateJson<{ at: number } | null>(inFlightPath(kind, id, locale), null, (cur) => {
    if (cur && Date.now() - cur.at < IN_FLIGHT_MS) return NO_CHANGE;
    ok = true;
    return { at: Date.now() };
  });
  return ok;
}

async function translateClaimed(opts: Parameters<typeof translateContent>[0]): Promise<TranslateOutcome> {
  const { kind, id, locale, sourceHash } = opts;
  // Re-checked under the claim: the run that held it may have just stored it.
  const stored = await storedTranslation(kind, id, locale, sourceHash);
  if (stored) return stored;

  if (!(await spend(opts.credits))) {
    return { ok: false, status: 402, error: "Your school does not have enough translation credits for this document." };
  }

  let text: string;
  try {
    text = await callModel(locale, opts.title, opts.content, opts.deadline);
  } catch (err) {
    console.error("[translate] failed", kind, id, locale, err);
    await addCredits(opts.credits).catch((e) =>
      console.error("[translate] 🔴 REFUND FAILED, add back by hand:", opts.credits, "credits", e)
    );
    return {
      ok: false,
      status: 502,
      error: err instanceof TranslationError ? err.message : "The translation could not be done just now. Please try again in a moment.",
    };
  }

  const record: StoredTranslation = { sourceHash, text, translatedAt: new Date().toISOString() };
  try {
    await writeJson(storePath(kind, id, locale), record);
  } catch (err) {
    // Paid for and done: show it anyway rather than throw the text away.
    console.error("[translate] could not store", kind, id, locale, err);
  }
  return { ok: true, text, translatedAt: record.translatedAt, fromStore: false };
}

class TranslationError extends Error {}

async function callModel(
  locale: Locale,
  title: string,
  content: Anthropic.ContentBlockParam[],
  deadline: number
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const language = LOCALES.find((l) => l.code === locale)!.label;

  // Few retries: each one restarts a long stream inside a time-limited function.
  const client = new Anthropic({ apiKey, maxRetries: 2 });
  // Streamed: a long policy can take minutes to write out in full.
  const message = await client.messages
    .stream({
      model: MODEL,
      max_tokens: 64000,
      // Translation needs little reasoning; low effort keeps a long document
      // inside the function's time limit and the cost down.
      output_config: { effort: "low" },
      system:
        "You translate South African school governance documents. Translate the whole document faithfully, " +
        "keeping headings, numbering, lists, amounts, dates, names and legal references (SASA, BELA Act, section numbers) exactly as they are. " +
        "Use the formal register a school governing body would use. Output only the translation as plain text, using " +
        "'# ' for headings and '- ' for list items. No preamble, no notes.",
      messages: [
        {
          role: "user",
          content: [...content, { type: "text", text: `Translate the document "${title}" above into ${language}.` }],
        },
      ],
    }, {
      // Stopped by us before the route's 800s, counted from the start of the
      // request, so the catch runs and the credits go back. A run Vercel
      // kills itself would keep them.
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    })
    .finalMessage();

  if (message.stop_reason === "refusal") {
    throw new TranslationError("This document could not be translated automatically.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new TranslationError("This document is too long to translate in one go.");
  }
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new Error("Empty translation");
  return text;
}
