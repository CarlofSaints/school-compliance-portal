"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth, authFetch, apiErrorMessage } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";
import { CREDIT_PACK, MAX_PACKS } from "@/lib/creditPack";

// Where the greyed Translate button sends people: the school's credit
// balance, how to load more, and who may spend them. Loading is by EFT for
// now (PayFast is not set up yet): the school orders here, is invoiced, and
// School Compliance adds the credits once paid (lib/creditRequests.ts).
const PACK_CREDITS = CREDIT_PACK.credits;
const PACK_RAND = CREDIT_PACK.rand;

export default function TranslationCreditsPage() {
  const t = useT();
  const { session, loading } = useAuth("manage_users");
  const [data, setData] = useState<{
    balance: number;
    spenders: { id: string; name: string; email: string }[];
    pending: { id: string; credits: number; amountRand: number; reference: string; requestedBy: string; requestedAt: string }[];
  } | null>(null);
  const [error, setError] = useState("");
  const [packs, setPacks] = useState(1);
  const [reference, setReference] = useState("");
  const [ordering, setOrdering] = useState(false);
  const [orderMsg, setOrderMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!session) return;
    authFetch("/api/translation-credits")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(t("Could not load your credit balance.")));
  }, [session, t, reload]);

  const order = async () => {
    if (ordering) return;
    setOrdering(true);
    setOrderMsg(null);
    try {
      const res = await authFetch("/api/translation-credits/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packs, reference }),
      });
      if (!res.ok) setOrderMsg({ ok: false, text: await apiErrorMessage(res) });
      else {
        setOrderMsg({
          ok: true,
          text: t("Done. An invoice for R{amount} will follow by email. The credits are added as soon as the EFT comes in.", {
            amount: packs * PACK_RAND,
          }),
        });
        setReference("");
        setReload((n) => n + 1);
      }
    } catch {
      setOrderMsg({ ok: false, text: t("Your request could not be sent just now. Please try again in a moment.") });
    } finally {
      setOrdering(false);
    }
  };

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
            <li>{t("Credits are only for documents your school adds, like policies and minutes. Everything already in the portal changes language for free when you pick one.")}</li>
            <li>{t("R100 for 10 credits. Credits never expire.")}</li>
            <li>{t("1 credit translates up to 10 pages of one document into one language.")}</li>
            <li>{t("Once a document is translated, anyone at your school can read it in that language for free.")}</li>
          </ul>
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-2">{t("Load credits")}</h2>
          <p className="mb-3">{t("Order here and we send you an invoice. Pay it by EFT and the credits are added once the payment comes in.")}</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-gray-500">
              {t("Packs of 10 credits")}
              <select
                value={packs}
                onChange={(e) => setPacks(Number(e.target.value))}
                className="block mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                {Array.from({ length: MAX_PACKS }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {t("{credits} credits (R{amount})", { credits: n * PACK_CREDITS, amount: n * PACK_RAND })}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-500 flex-1 min-w-48">
              {t("PO number or reference (optional)")}
              <input
                value={reference}
                maxLength={60}
                onChange={(e) => setReference(e.target.value)}
                className="block w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </label>
            <button
              onClick={order}
              disabled={ordering}
              className="bg-primary text-white px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {ordering ? t("Sending...") : t("Request credits")}
            </button>
          </div>
          {orderMsg && (
            <p className={`mt-3 ${orderMsg.ok ? "text-emerald-700" : "text-red-600"}`}>{orderMsg.text}</p>
          )}
          {data && data.pending.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-medium text-gray-500 mb-1">{t("Waiting for payment")}</div>
              <ul className="space-y-1">
                {data.pending.map((r) => (
                  <li key={r.id}>
                    {t("{credits} credits (R{amount}), asked for by {name} on {date}", {
                      credits: r.credits,
                      amount: r.amountRand,
                      name: r.requestedBy,
                      date: new Date(r.requestedAt).toLocaleDateString("en-ZA"),
                    })}
                    {r.reference && <span className="text-gray-400"> · {r.reference}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
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
