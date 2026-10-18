"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth, authFetch } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";

// Where the greyed Translate button sends people: the school's credit
// balance, how to load more, and who may spend them. Loading is by email for
// now (PayFast is not set up yet); School Compliance adds the credits once
// paid, on /platform/<key>.
const BUY_EMAIL = "info@outerjoin.co.za";

export default function TranslationCreditsPage() {
  const t = useT();
  const { session, loading } = useAuth("manage_users");
  const [data, setData] = useState<{
    balance: number;
    spenders: { id: string; name: string; email: string }[];
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    authFetch("/api/translation-credits")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(t("Could not load your credit balance.")));
  }, [session, t]);

  if (loading || !session) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("Translation Credits")}</h1>
        <p className="text-gray-500 mt-1">
          {t("Translate your school's policies and minutes into the language chosen at the top right.")}
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 max-w-2xl space-y-6 text-sm text-gray-700">
        <div>
          <div className="text-xs text-gray-500">{t("Credits left")}</div>
          <div className="text-3xl font-bold text-dark">{data ? data.balance : "…"}</div>
          {error && <p className="text-red-600 mt-1">{error}</p>}
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-2">{t("How credits work")}</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>{t("R100 for 10 credits. Credits never expire.")}</li>
            <li>{t("1 credit translates up to 10 pages of one document into one language.")}</li>
            <li>{t("Once a document is translated, anyone at your school can read it in that language for free.")}</li>
          </ul>
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-2">{t("Load credits")}</h2>
          <p>
            {t("Email {email} with your school's name and how many credits you want. The credits are added to your balance once paid.", { email: BUY_EMAIL })}
          </p>
          <a
            href={`mailto:${BUY_EMAIL}?subject=${encodeURIComponent("Translation credits")}`}
            className="inline-block mt-3 bg-primary text-white px-4 py-2 rounded-lg"
          >
            {t("Email to buy credits")}
          </a>
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-2">{t("Who may spend credits")}</h2>
          {data && data.spenders.length === 0 && (
            <p className="text-amber-700">{t("Nobody yet. Nobody can translate a new document until someone is ticked.")}</p>
          )}
          {data && data.spenders.length > 0 && (
            <ul className="space-y-1">
              {data.spenders.map((u) => (
                <li key={u.id}>
                  {u.name} <span className="text-gray-400">{u.email}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-gray-500 mt-2">
            {t("Tick \"Can spend translation credits\" on a user in")}{" "}
            <Link href="/admin/users" className="text-primary underline">
              {t("Users")}
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
