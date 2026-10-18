"use client";

import { createContext, useContext, useMemo } from "react";
import { makeT, type Dict } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/locales";

const I18nContext = createContext<{ locale: Locale; dict: Dict }>({ locale: "en", dict: {} });

export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dict;
  children: React.ReactNode;
}) {
  return <I18nContext.Provider value={{ locale, dict }}>{children}</I18nContext.Provider>;
}

export function useLocale() {
  return useContext(I18nContext).locale;
}

export function useT() {
  const { dict } = useContext(I18nContext);
  return useMemo(() => makeT(dict), [dict]);
}
