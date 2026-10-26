import type { Locale } from "../i18n/locales";
import type { GuideText } from "./types";
import { en } from "./en";
import { af } from "./af";
import { zu } from "./zu";
import { xh } from "./xh";
import { nso } from "./nso";
import { tn } from "./tn";
import { st } from "./st";

/** The standard guide's words, by language. English is the source. */
export const GUIDE_TEXT: Record<Locale, GuideText> = { en, af, zu, xh, nso, tn, st };
