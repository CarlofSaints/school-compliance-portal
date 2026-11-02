import { GUIDE_TEXT } from "./guideText";
import { CHAPTER_VIDEOS } from "./defaultGuide";
import { NEWER_THAN_GUIDE, stripGuideHtml } from "./jonoHowTo";
import type { Locale } from "./i18n/locales";

// ---------------------------------------------------------------------------
// Ask Jono, FREE: a "how do I..." question answered straight from the Guide,
// with no AI at all. Carl: "if it can give an answer without credits (i.e.:
// without using Anthropic), then it should answer."
//
// A plain word match: the question's meaningful words against each Guide
// chapter and each newer-feature line. Only a clear match answers; anything
// else goes to the AI (and, from JONO_CHARGING_FROM, costs credits). The page
// offers "Ask the AI instead" under a free answer that missed.
// ---------------------------------------------------------------------------

const HOW = /^\s*(how|where|what('s| is) the (way|step)|can i|is there a way|show me how|steps? to)\b|\bhow (do|can|would|should) (i|we|you)\b/i;

// Words that say nothing about WHICH feature.
const STOP = new Set(
  "how do does did i we you a an the to in on of for my our is are be can could would should with from at it this that there way what where which when who show me please new add make create set up get use using portal page".split(" ")
);

// A plain singular: templates/template, types/type, policies/policy, boxes/box.
const stem = (w: string) =>
  w.endsWith("ies")
    ? w.slice(0, -3) + "y"
    : /(ses|xes|ches|shes)$/.test(w)
      ? w.slice(0, -2)
      : w.endsWith("s") && !w.endsWith("ss")
        ? w.slice(0, -1)
        : w;
const words = (s: string) => (s.toLowerCase().match(/[\p{L}]{3,}/gu) ?? []).map(stem).filter((w) => !STOP.has(w));

interface Unit {
  title: string;
  text: string;
  video?: string;
}

function units(locale: Locale): Unit[] {
  const chapters = (GUIDE_TEXT[locale] ?? GUIDE_TEXT.en).chapters("your school", "SGB");
  const fromGuide = chapters.map((c, i) => {
    const clip = CHAPTER_VIDEOS[i]?.[1]?.[0];
    return { title: c.title, text: stripGuideHtml(c.html), video: clip ? `/tutorials/${clip[0]}.mp4` : undefined };
  });
  const newer = NEWER_THAN_GUIDE.trim()
    .split("\n")
    .map((l) => l.replace(/^-\s*/, "").trim())
    .filter(Boolean)
    .map((l) => ({ title: l.split(":")[0], text: l }));
  // The newer-feature notes are English only: in another language the Guide
  // chapters (translated) answer, or the AI does, in that language.
  return locale === "en" ? [...newer, ...fromGuide] : fromGuide;
}

// Built once per language, not on every question.
const built = new Map<Locale, (Unit & { titleWords: Set<string>; bodyWords: Set<string> })[]>();
function indexed(locale: Locale) {
  let list = built.get(locale);
  if (!list) {
    list = units(locale).map((u) => ({ ...u, titleWords: new Set(words(u.title)), bodyWords: new Set(words(u.text)) }));
    built.set(locale, list);
  }
  return list;
}

/** The free answer, or null when the question is not a clear "how do I" the Guide covers. */
export function freeHowTo(question: string, locale: Locale): string | null {
  if (!HOW.test(question)) return null;
  const asked = [...new Set(words(question))];
  if (asked.length === 0) return null;
  let best: { unit: Unit; score: number } | null = null;
  for (const unit of indexed(locale)) {
    const score = asked.reduce((n, w) => n + (unit.titleWords.has(w) ? 3 : unit.bodyWords.has(w) ? 1 : 0), 0);
    if (!best || score > best.score) best = { unit, score };
  }
  // Every meaningful word must be found, and at least one in a heading.
  if (!best || best.score < Math.max(3, asked.length + 2)) return null;
  const text = best.unit.text.length > 1800 ? `${best.unit.text.slice(0, 1800).replace(/\s\S*$/, "")}...` : best.unit.text;
  // The link text is a symbol and the chapter's own title, so it reads right in every language.
  return `**${best.unit.title}**\n\n${text}${best.unit.video ? `\n\n[▶ ${best.unit.title}](${best.unit.video})` : ""}`;
}
