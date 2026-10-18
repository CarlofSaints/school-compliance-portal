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

export function isLocale(v: unknown): v is Locale {
  return LOCALES.some((l) => l.code === v);
}
