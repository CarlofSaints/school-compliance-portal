// The course library in every language, translated ONCE and shipped with the
// portal, so no school translates (or pays for) the same generic text again.
// Keyed by unitHash of the English piece (lib/campusTranslation.ts). Written by
// scripts/translate-campus-library.ts; run it again after changing a course.
import type { Locale } from "../../i18n/locales";
import type { Unit } from "../../campusTranslation";
import af from "./af.json";
import zu from "./zu.json";
import xh from "./xh.json";
import nso from "./nso.json";
import tn from "./tn.json";
import st from "./st.json";

export const SHIPPED: Partial<Record<Locale, Record<string, Unit>>> = { af, zu, xh, nso, tn, st } as Partial<Record<Locale, Record<string, Unit>>>;
