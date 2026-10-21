// The languages a visitor can pick, top right on every page. English is the
// source text: every t("...") key IS the English, so a string missing from a
// dictionary falls back to readable English rather than a key or a blank.
export const LOCALES = [
  { code: "en", label: "English" },
  { code: "af", label: "Afrikaans" },
  { code: "zu", label: "isiZulu" },
  { code: "xh", label: "isiXhosa" },
  { code: "nso", label: "Sepedi" },
  { code: "tn", label: "Setswana" },
  { code: "st", label: "Sesotho" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

export const LANG_COOKIE = "lang";

/** "15 October 2026" in the reader's language, always day month year. */
export function formatDayMonthYear(iso: string, locale: Locale): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const tag = `${locale}-ZA`;
  const use = Intl.DateTimeFormat.supportedLocalesOf(tag).length ? tag : "en-ZA";
  const parts = new Intl.DateTimeFormat(use, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).formatToParts(d);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  // Assembled by hand: ICU orders zu/xh as "Okthoba 15, 2026" and nso/tn/st as "2026 Oktobore 15".
  return `${part("day")} ${part("month")} ${part("year")}`;
}

export function isLocale(v: unknown): v is Locale {
  return LOCALES.some((l) => l.code === v);
}
