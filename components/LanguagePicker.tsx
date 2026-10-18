"use client";

import { useRouter } from "next/navigation";
import { LANG_COOKIE, LOCALES } from "@/lib/i18n/locales";
import { useLocale } from "@/components/I18nProvider";

// Stored in a cookie, not the account, so it works before sign-in and on the
// public pages. refresh() re-renders the server parts in the new language.
export default function LanguagePicker() {
  const locale = useLocale();
  const router = useRouter();
  return (
    <select
      aria-label="Language"
      value={locale}
      onChange={(e) => {
        document.cookie = `${LANG_COOKIE}=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
      className="rounded-md border border-gray-200 bg-white/90 px-2 py-1 text-sm text-gray-700 shadow-sm backdrop-blur focus:outline-none focus:ring-2 focus:ring-primary"
    >
      {LOCALES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
