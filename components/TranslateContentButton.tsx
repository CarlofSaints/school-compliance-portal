"use client";

import { useEffect, useState } from "react";
import { authFetch, apiErrorMessage } from "@/lib/useAuth";
import { useLocale, useT } from "@/components/I18nProvider";
import { LOCALES } from "@/lib/i18n/locales";

// The school's own document (a policy, a set of minutes) in the language
// picked top right, paid with translation credits. Hidden in English. A
// document already translated is served from storage, free; a new one shows
// its cost in credits first and only spends them on "Translate".
//
// Carl: a school with no credits still SEES the button, greyed, and hovering
// or clicking says where to load credits. The same for a user who is not
// ticked "Can spend translation credits". A document already translated is
// never greyed: reading it is free for everybody.
export default function TranslateContentButton({ kind, id }: { kind: "policy" | "minutes"; id: string }) {
  const t = useT();
  const locale = useLocale();
  const [quote, setQuote] = useState<{ credits: number; pages: number; balance: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<{ stored: boolean; balance: number; canSpend: boolean } | null>(null);
  const [blockedOpen, setBlockedOpen] = useState(false);

  useEffect(() => {
    if (locale === "en") return;
    authFetch(`/api/translate?kind=${kind}&id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStatus(d))
      .catch(() => setStatus(null));
  }, [locale, kind, id]);

  if (locale === "en") return null;
  // Why the button is greyed, or "" when it can be used.
  const blocked = !status || status.stored
    ? ""
    : status.balance <= 0
      ? t("To translate, you need credits. Go to Admin > Translation Credits to load credits.")
      : !status.canSpend
        ? t("You are not allowed to spend translation credits. Ask your administrator to tick \"Can spend translation credits\" on your user.")
        : "";
  const language = LOCALES.find((l) => l.code === locale)?.label ?? locale;

  const run = async (confirm: boolean) => {
    setOpen(true);
    setBusy(true);
    setError("");
    setText("");
    setQuote(null);
    try {
      const res = await authFetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, confirm }),
      });
      if (!res.ok) setError(await apiErrorMessage(res, t("The translation could not be done just now.")));
      else {
        const d = await res.json();
        if (d.quote) setQuote(d.quote);
        else setText(d.text);
      }
    } catch {
      setError(t("The translation could not be done just now."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <span className="relative inline-block">
        <button
          onClick={() => (blocked ? setBlockedOpen((o) => !o) : run(false))}
          title={blocked || undefined}
          aria-disabled={!!blocked}
          className={`px-4 py-2 rounded-lg border border-gray-200 text-sm transition-colors ${
            blocked ? "text-gray-400 bg-gray-50 cursor-not-allowed" : "hover:bg-gray-50"
          }`}
        >
          {t("Translate into {language}", { language })}
        </button>
        {blocked && blockedOpen && (
          <span
            role="status"
            className="absolute right-0 top-full mt-2 z-40 w-72 rounded-lg bg-dark text-white text-xs p-3 shadow-lg"
          >
            {blocked}
          </span>
        )}
      </span>
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
              {quote && (
                <div className="space-y-3">
                  <p>
                    {t("This document is about {pages} pages. Translating it into {language} costs {credits} credits. Your school has {balance} credits.", {
                      pages: quote.pages,
                      language,
                      credits: quote.credits,
                      balance: quote.balance,
                    })}
                  </p>
                  {quote.balance >= quote.credits ? (
                    <button
                      onClick={() => run(true)}
                      className="bg-primary text-white px-4 py-2 rounded-lg text-sm"
                    >
                      {t("Translate ({credits} credits)", { credits: quote.credits })}
                    </button>
                  ) : (
                    <p className="text-amber-700">
                      {t("Your school needs more translation credits. Go to Admin > Translation Credits to load credits.")}
                    </p>
                  )}
                  <p className="text-xs text-gray-500">
                    {t("Once translated, anyone at your school can read it in {language} for free.", { language })}
                  </p>
                </div>
              )}
              {error && <p className="text-red-600">{error}</p>}
              {text}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
