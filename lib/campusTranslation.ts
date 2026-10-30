import Anthropic from "@anthropic-ai/sdk";
import { createHash, randomUUID } from "crypto";
import { readJson, updateJson, NO_CHANGE } from "./controlData";
import { LOCALES, type Locale } from "./i18n/locales";
import type { Material, Test, TrainingModule, TrainingSource } from "./training";

// ---------------------------------------------------------------------------
// Campus in the reader's language.
//
// Carl, 30 Oct 2026: content the AI wrote (the course library and courses
// built with AI) translates for free when someone switches language; content
// a person typed or uploaded can be translated too, but that costs the
// school's credits, like a policy. Module headings are tiny, so every module's
// title and description translate for free whatever made it.
//
// A translation is stored per school, per language, against a hash of the
// English it came from. Editing the English changes the hash, so the old
// translation is no longer used: AI content is translated again for free,
// manual content needs paying for again (as with a new policy version).
//
// Translations are applied BY POSITION over the item as stored, so ids, the
// memo (isCorrect) and every setting come from the English item only. A
// translation can change words, never which answer is right.
// ---------------------------------------------------------------------------

const MODEL = "claude-opus-5-5";

export type CampusKind = "material" | "test" | "module";
type Item = Material | Test | TrainingModule;

/** The words of an item that a reader sees, in order, without ids. */
export interface Unit {
  title: string;
  description: string;
  body: string;
  questions: { text: string; options: string[]; explanation: string; acceptedAnswers: string[] }[];
}

interface Entry {
  hash: string;
  unit: Unit;
  at: string;
  /** Paid for with credits (manual content). */
  paid?: boolean;
}
type Store = Record<string, Entry>;

const storePath = (locale: Locale) => `training/translations/${locale}.json`;
const claimPath = (locale: Locale, key: string) => `training/translations/claims/${locale}/${key.replace(/[^\w-]/g, "_")}.json`;
export const keyOf = (kind: CampusKind, id: string) => `${kind}:${id}`;

export function unitOf(kind: CampusKind, item: Item): Unit {
  const base = { title: item.title, description: item.description ?? "", body: "", questions: [] as Unit["questions"] };
  if (kind === "material") return { ...base, body: (item as Material).body ?? "" };
  if (kind === "test")
    return {
      ...base,
      questions: (item as Test).questions.map((q) => ({
        text: q.text,
        options: q.options.map((o) => o.text),
        explanation: q.explanation ?? "",
        acceptedAnswers: q.acceptedAnswers ?? [],
      })),
    };
  return base;
}

export const unitHash = (u: Unit) => createHash("sha256").update(JSON.stringify(u)).digest("hex").slice(0, 32);

/** Same shape as the English, or it is not used: a half-matching translation could put words under the wrong option. */
export function sameShape(a: Unit, b: Unit): boolean {
  return (
    typeof b?.title === "string" &&
    typeof b.description === "string" &&
    typeof b.body === "string" &&
    Array.isArray(b.questions) &&
    a.questions.length === b.questions.length &&
    a.questions.every((q, i) => b.questions[i] && q.options.length === b.questions[i].options.length && Array.isArray(b.questions[i].acceptedAnswers))
  );
}

/** The item with its words replaced by the translation, position by position. Ids, memo and settings untouched. */
export function applyUnit<T extends Item>(kind: CampusKind, item: T, u: Unit): T {
  const out = { ...item, title: u.title || item.title, description: u.description };
  if (kind === "material") return { ...out, body: u.body || (item as Material).body } as T;
  if (kind === "test") {
    return {
      ...out,
      questions: (item as Test).questions.map((q, i) => ({
        ...q,
        text: u.questions[i].text || q.text,
        explanation: u.questions[i].explanation,
        options: q.options.map((o, j) => ({ ...o, text: u.questions[i].options[j] || o.text })),
        // Both kept: a typed answer is accepted in English or in the translation.
        acceptedAnswers: [...q.acceptedAnswers, ...u.questions[i].acceptedAnswers.filter((a) => a.trim())],
      })),
    } as T;
  }
  return out as T;
}

/** Free when the AI wrote it; manual content is paid for. Module headings are always free (see top). */
export const isFree = (kind: CampusKind, source: TrainingSource | undefined) => kind === "module" || source === "ai" || source === "library";

export async function translationsFor(locale: Locale): Promise<Store> {
  return locale === "en" ? {} : readJson<Store>(storePath(locale), {});
}

export type TranslationState =
  | { state: "english" }
  | { state: "translated" }
  | { state: "pending" }
  | { state: "paid"; credits: number };

/** The translation stored for exactly this English, or null. */
export function storedFor(store: Store, kind: CampusKind, item: Item): Unit | null {
  const entry = store[keyOf(kind, item.id)];
  return entry && entry.hash === unitHash(unitOf(kind, item)) && sameShape(unitOf(kind, item), entry.unit) ? entry.unit : null;
}

export async function saveTranslation(locale: Locale, kind: CampusKind, item: Item, unit: Unit, paid = false): Promise<void> {
  const hash = unitHash(unitOf(kind, item));
  await updateJson<Store>(storePath(locale), {}, (store) => ({
    ...store,
    [keyOf(kind, item.id)]: { hash, unit, at: new Date().toISOString(), ...(paid ? { paid: true } : {}) },
  }));
}

/** One translation of an item per language at a time, so two readers never pay (or cost us) twice. */
export async function claim(locale: Locale, key: string): Promise<boolean> {
  let ok = false;
  await updateJson<{ at: number; rev?: string } | null>(claimPath(locale, key), null, (cur) => {
    if (cur && Date.now() - cur.at < 10 * 60_000) return NO_CHANGE;
    ok = true;
    return { at: Date.now(), rev: randomUUID() };
  });
  return ok;
}
export async function release(locale: Locale, key: string): Promise<void> {
  await updateJson<{ at: number } | null>(claimPath(locale, key), null, () => null).catch(() => {});
}

const UNIT_SCHEMA = {
  type: "object",
  properties: {
    units: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          body: { type: "string" },
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                options: { type: "array", items: { type: "string" } },
                explanation: { type: "string" },
                acceptedAnswers: { type: "array", items: { type: "string" } },
              },
              required: ["text", "options", "explanation", "acceptedAnswers"],
              additionalProperties: false,
            },
          },
        },
        required: ["title", "description", "body", "questions"],
        additionalProperties: false,
      },
    },
  },
  required: ["units"],
  additionalProperties: false,
} as const;

export class CampusTranslateError extends Error {}

/** Translates several units in one call. Every unit comes back in the same shape, or the call fails. */
export async function translateUnits(locale: Locale, units: Unit[], deadline: number): Promise<Unit[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const language = LOCALES.find((l) => l.code === locale)!.label;
  const client = new Anthropic({ apiKey, maxRetries: 2 });
  const message = await client.messages
    .stream(
      {
        model: MODEL,
        max_tokens: 64000,
        output_config: { effort: "low", format: { type: "json_schema", schema: UNIT_SCHEMA } },
        system:
          "You translate South African school training (lessons and multiple-choice tests for SGB or board of governors members and staff). " +
          "Translate every string faithfully into the target language. Keep Act names, section numbers (SASA s20), amounts, dates, emoji, and the markdown marks ('## ', '- ', '**', '> ') exactly as they are. " +
          "Return exactly the same structure: the same number of units, questions and options, in the same order. Empty strings stay empty. " +
          "acceptedAnswers: translate each accepted typed answer the way a learner would type it in the target language.",
        messages: [{ role: "user", content: `Translate into ${language}:\n\n${JSON.stringify({ units })}` }],
      },
      { signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) }
    )
    .finalMessage();
  if (message.stop_reason === "refusal") throw new CampusTranslateError("This could not be translated automatically.");
  if (message.stop_reason === "max_tokens") throw new CampusTranslateError("This is too long to translate in one go.");
  const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  let out: Unit[];
  try {
    out = (JSON.parse(text) as { units: Unit[] }).units;
  } catch {
    throw new CampusTranslateError("The translation could not be read. Please try again.");
  }
  if (!Array.isArray(out) || out.length !== units.length || !units.every((u, i) => sameShape(u, out[i]))) {
    throw new CampusTranslateError("The translation did not match the original. Please try again.");
  }
  return out;
}

/**
 * Free translations still missing for these items, done in the background
 * (after the response, so nobody waits). Headings first in one call, then
 * each lesson or test on its own. Each item is claimed so two readers never
 * translate it twice. shortcut: at most `limit` items per call, the rest go
 * on the next visit; fine for a school's Campus, revisit if it grows to hundreds.
 */
export async function translateMissingFree(locale: Locale, items: { kind: CampusKind; item: Item }[], limit = 12): Promise<void> {
  if (locale === "en") return;
  const store = await translationsFor(locale);
  const todo = items.filter(({ kind, item }) => isFree(kind, item.source) && !storedFor(store, kind, item)).slice(0, limit);
  const deadline = Date.now() + 240_000;
  const heads = todo.filter((x) => x.kind === "module");
  const bodies = todo.filter((x) => x.kind !== "module");
  const run = async (group: typeof todo) => {
    const mine: typeof todo = [];
    for (const x of group) if (await claim(locale, keyOf(x.kind, x.item.id))) mine.push(x);
    if (!mine.length) return;
    try {
      const out = await translateUnits(locale, mine.map((x) => unitOf(x.kind, x.item)), deadline);
      for (let i = 0; i < mine.length; i++) await saveTranslation(locale, mine[i].kind, mine[i].item, out[i]);
    } catch (err) {
      console.error("[campus translate] free translation failed", locale, err);
    } finally {
      await Promise.all(mine.map((x) => release(locale, keyOf(x.kind, x.item.id))));
    }
  };
  if (heads.length) await run(heads);
  for (const x of bodies) {
    if (Date.now() > deadline - 60_000) break;
    await run([x]);
  }
}

/**
 * Whole Campus lists in the reader's language, for the catalogue pages:
 * stored translations applied, and the free ones still missing queued in the
 * background so they are there on the next visit.
 */
export async function inReaderLanguageLists<M extends Material, T extends Test, D extends TrainingModule>(
  lists: { materials: M[]; tests: T[]; modules: D[] }
): Promise<{ materials: M[]; tests: T[]; modules: D[] }> {
  const { getLocale } = await import("./i18n/server");
  const locale = await getLocale().catch(() => "en" as const);
  if (locale === "en") return lists;
  const store = await translationsFor(locale);
  const one = <X extends Item>(kind: CampusKind, item: X): X => {
    const unit = storedFor(store, kind, item);
    return unit ? applyUnit(kind, item, unit) : item;
  };
  const visible = <X extends Item>(list: X[]) => list.filter((x) => x.status === "published");
  const missing = [
    ...visible(lists.modules).map((item) => ({ kind: "module" as const, item })),
    ...visible(lists.materials).map((item) => ({ kind: "material" as const, item })),
    ...visible(lists.tests).map((item) => ({ kind: "test" as const, item })),
  ].filter(({ kind, item }) => isFree(kind, item.source) && !storedFor(store, kind, item));
  if (missing.length) {
    const { afterResponse } = await import("./activityActor");
    await afterResponse(() => translateMissingFree(locale, missing));
  }
  return {
    materials: lists.materials.map((m) => one("material", m)),
    tests: lists.tests.map((t) => one("test", t)),
    modules: lists.modules.map((m) => one("module", m)),
  };
}
