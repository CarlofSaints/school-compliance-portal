import Anthropic from "@anthropic-ai/sdk";
import { readJson, writeJson, updateJson, NO_CHANGE } from "./controlData";
import { LOCALES, type Locale } from "./i18n/locales";

// ---------------------------------------------------------------------------
// Translating a SCHOOL'S OWN content (a policy, a set of minutes) into the
// visitor's language. A paid add-on, R100/month, switched on per school by
// Carl on /platform/<key>.
//
// The site's own buttons and labels are NOT this: those are stored
// dictionaries (lib/i18n). This is for text the school wrote, which no
// dictionary can know in advance.
//
// 🔴 Translated ONCE per document version per language, then stored. Every
// later reader of that version in that language gets the stored copy and
// costs nothing. A new policy version or an edited set of minutes changes the
// source hash, so the next request translates again (and counts again).
//
// All storage goes through controlData, which is already scoped to the
// current school, so one school's translations and usage never reach another.
// ---------------------------------------------------------------------------

export const ADDON_PRICE_RAND = 100;
export const DEFAULT_MONTHLY_CAP = 20;

export interface TranslationAddon {
  enabled: boolean;
  /** New translations per calendar month. Stored copies do not count. */
  monthlyCap: number;
  changedAt?: string;
  changedBy?: string;
}

const ADDON_PATH = "settings/translation-addon.json";
const OFF: TranslationAddon = { enabled: false, monthlyCap: DEFAULT_MONTHLY_CAP };

export async function getAddon(): Promise<TranslationAddon> {
  const saved = await readJson<TranslationAddon>(ADDON_PATH, OFF);
  // HVPS and Jeppe are single-school projects with no /platform page, so the
  // add-on is switched on there with an env var instead. 🔴 Never on the
  // multi-tenant app (it holds the control store token), where it would hand
  // every school the paid add-on, and never over an explicit saved choice.
  if (
    !saved.enabled &&
    !saved.changedAt &&
    process.env.TRANSLATION_ADDON === "1" &&
    !process.env.CONTROL_BLOB_READ_WRITE_TOKEN
  ) {
    return { ...saved, enabled: true };
  }
  return saved;
}

export async function saveAddon(addon: TranslationAddon): Promise<void> {
  await writeJson(ADDON_PATH, addon);
}

// SAST month, so the allowance resets at midnight in South Africa, not UTC.
export function usageMonth(now = new Date()): string {
  return new Date(now.getTime() + 2 * 3600_000).toISOString().slice(0, 7);
}

const usagePath = (month: string) => `translations/usage/${month}.json`;

export async function getUsage(month = usageMonth()): Promise<number> {
  return (await readJson<{ count: number }>(usagePath(month), { count: 0 })).count;
}

/** Takes one from this month's allowance, atomically. The month charged, or
 *  null when it is used up. */
async function reserve(cap: number): Promise<string | null> {
  const month = usageMonth();
  let ok = false;
  await updateJson<{ count: number }>(usagePath(month), { count: 0 }, (u) => {
    if (u.count >= cap) return NO_CHANGE;
    ok = true;
    return { count: u.count + 1 };
  });
  return ok ? month : null;
}

/** Gives the reservation back to the month it was taken from. */
async function release(month: string): Promise<void> {
  await updateJson<{ count: number }>(usagePath(month), { count: 0 }, (u) =>
    u.count > 0 ? { count: u.count - 1 } : NO_CHANGE
  );
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

/** The stored copy for exactly this source, or null. Free: no AI, no allowance. */
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
 * new one (if the add-on is on and the month has allowance left).
 * `source` is only called when a new translation is actually needed, so a
 * stored hit never downloads the policy file.
 */
export async function translateContent(opts: {
  kind: ContentKind;
  id: string;
  locale: Locale;
  sourceHash: string;
  title: string;
  source: () => Promise<Anthropic.ContentBlockParam[]>;
}): Promise<TranslateOutcome> {
  const { kind, id, locale, sourceHash } = opts;
  if (locale === "en") return { ok: false, status: 400, error: "Pick a language other than English first." };

  const addon = await getAddon();
  if (!addon.enabled) {
    return {
      ok: false,
      status: 403,
      error: "Translating school documents is an add-on. Ask your administrator to contact School Compliance to switch it on.",
    };
  }

  const stored = await storedTranslation(kind, id, locale, sourceHash);
  if (stored) return stored;

  // One translation of a document at a time: a second click, or a colleague
  // opening the same minutes, must not pay twice for the same text.
  if (!(await claimInFlight(kind, id, locale))) {
    return { ok: false, status: 409, error: "This document is being translated right now. Try again in a minute or two." };
  }
  try {
    return await translateClaimed(opts, addon.monthlyCap);
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

async function translateClaimed(
  opts: Parameters<typeof translateContent>[0],
  cap: number
): Promise<TranslateOutcome> {
  const { kind, id, locale, sourceHash } = opts;
  // Re-checked under the claim: the run that held it may have just stored it.
  const stored = await storedTranslation(kind, id, locale, sourceHash);
  if (stored) return stored;

  const month = await reserve(cap);
  if (!month) {
    return {
      ok: false,
      status: 429,
      error: `Your school has used all ${cap} document translations for this month. Documents already translated can still be read.`,
    };
  }

  let text: string;
  try {
    text = await callModel(locale, opts.title, await opts.source());
  } catch (err) {
    await release(month);
    console.error("[translate] failed", kind, id, locale, err);
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
  content: Anthropic.ContentBlockParam[]
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const language = LOCALES.find((l) => l.code === locale)!.label;

  // Few retries: each one restarts a long stream inside a time-limited function.
  const client = new Anthropic({ apiKey, maxRetries: 2 });
  // Streamed: a long policy can take minutes to write out in full.
  const message = await client.messages
    .stream({
      model: "claude-opus-5-5",
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
