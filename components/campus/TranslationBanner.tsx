"use client";

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/components/I18nProvider";
import { authFetch } from "@/lib/useAuth";

export type CampusTranslation =
  | { state: "english" }
  | { state: "translated" }
  | { state: "pending" }
  | { state: "paid"; credits: number; canSpend?: boolean };

/**
 * Above a lesson or test read in another language (lib/campusTranslation.ts):
 * nothing when it is translated or the reader is in English; a note while a
 * free translation is being made; for manual content, what translating it
 * costs and a button for the people allowed to spend the school's credits.
 */
export default function TranslationBanner({
  kind,
  id,
  translation,
  onTranslated,
  guest = false,
}: {
  kind: "material" | "test";
  id: string;
  translation?: CampusTranslation;
  onTranslated: () => void;
  /** A share-link guest: no portal pages to link to. */
  guest?: boolean;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!translation || translation.state === "english" || translation.state === "translated") return null;

  if (translation.state === "pending") {
    return (
      <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        {t("This is being translated into your language. It shows in English this once; open it again in a minute or two.")}
      </div>
    );
  }

  const translate = async () => {
    setBusy(true);
    setError("");
    const send = (extra: Record<string, unknown>) =>
      authFetch("/api/training/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id, ...extra }) });
    try {
      let r = await send({});
      let body = await r.json().catch(() => ({}));
      if (r.ok && body.quote) {
        const credits = body.quote.credits as number;
        if (!confirm(credits === 1 ? t("Translate this for 1 credit?") : t("Translate this for {n} credits?", { n: credits }))) return;
        r = await send({ confirm: true, credits });
        body = await r.json().catch(() => ({}));
        if (r.ok && body.changed) setError(t("The content changed since it was priced. Please try again."));
      }
      if (r.ok && body.ok) onTranslated();
      else if (!r.ok) setError(body.error || t("Something went wrong. Please try again."));
    } catch {
      setError(t("Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const cost = translation.credits === 1 ? t("{n} credit", { n: 1 }) : t("{n} credits", { n: translation.credits });
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p>{t("This was written by someone at your school, so it is in English. Translating it uses the school's credits ({cost}); after that everyone reads it in this language for free.", { cost })}</p>
      {translation.canSpend ? (
        <button onClick={translate} disabled={busy} className="mt-2 bg-primary hover:bg-primary-dark text-white px-4 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">
          {busy ? t("Translating... this can take a minute") : t("Translate ({cost})", { cost })}
        </button>
      ) : (
        <p className="mt-1 text-xs">{t("Ask someone who may spend the school's credits to translate it.")}</p>
      )}
      {!guest && <Link href="/billing" className="ml-3 text-xs underline">{t("How billing works")}</Link>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
