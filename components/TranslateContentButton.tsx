"use client";

import { useEffect, useState } from "react";
import { authFetch, apiErrorMessage } from "@/lib/useAuth";
import { useLocale, useT } from "@/components/I18nProvider";
import { LOCALES } from "@/lib/i18n/locales";

// The paid add-on: the school's own document (a policy, a set of minutes) in
// the language picked top right. Hidden in English and for schools without
// the add-on. A document already translated is served from storage, free.
export default function TranslateContentButton({ kind, id }: { kind: "policy" | "minutes"; id: string }) {
  const t = useT();
  const locale = useLocale();
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (locale === "en") return;
    authFetch("/api/translate")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEnabled(Boolean(d?.enabled)))
      .catch(() => setEnabled(false));
  }, [locale]);

  if (locale === "en" || !enabled) return null;
  const language = LOCALES.find((l) => l.code === locale)?.label ?? locale;

  const run = async () => {
    setOpen(true);
    setBusy(true);
    setError("");
    setText("");
    try {
      const res = await authFetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id }),
      });
      if (!res.ok) setError(await apiErrorMessage(res, t("The translation could not be done just now.")));
      else setText((await res.json()).text);
    } catch {
      setError(t("The translation could not be done just now."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={run}
        className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors"
      >
        {t("Translate into {language}", { language })}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setOpen(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-dark">{language}</h2>
                <p className="text-xs text-amber-700 mt-1">
                  {t("Machine translation. The English is the official version.")}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="text-sm text-gray-500 hover:text-dark disabled:opacity-50"
              >
                {t("Close")}
              </button>
            </div>
            <div className="px-6 py-4 overflow-auto text-sm text-gray-800 whitespace-pre-wrap">
              {busy && t("Translating. A long document can take a minute or two…")}
              {error && <p className="text-red-600">{error}</p>}
              {text}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
