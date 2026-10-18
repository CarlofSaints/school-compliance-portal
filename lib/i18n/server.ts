import { cookies } from "next/headers";
import { LANG_COOKIE, isLocale, type Locale } from "./locales";
import { makeT, type Dict } from "./translate";
import af from "./dictionaries/af.json";
import zu from "./dictionaries/zu.json";
import xh from "./dictionaries/xh.json";
import nso from "./dictionaries/nso.json";
import tn from "./dictionaries/tn.json";
import st from "./dictionaries/st.json";

const DICTS: Record<Locale, Dict> = { en: {}, af, zu, xh, nso, tn, st };

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLocale(v) ? v : "en";
}

export function dictFor(locale: Locale): Dict {
  return DICTS[locale];
}

// For server components and route handlers.
export async function getT() {
  return makeT(DICTS[await getLocale()]);
}
