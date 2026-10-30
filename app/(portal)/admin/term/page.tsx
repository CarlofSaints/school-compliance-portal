"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth, authFetch } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";
import Toast from "@/components/Toast";

interface Term { id: string; startDate: string; endDate: string; lockedAt?: string; lockedCount?: number }
interface Member {
  id: string;
  name: string;
  email: string;
  positions: string[];
  exempt: string | null;
  superAdmin: boolean;
  keepsAccessAfterTerm: boolean;
  termLocked: boolean;
  retiredAt: string | null;
}
interface Data { terms: { current: Term | null; past: Term[] }; roster: Member[]; today: string; me: string }

const input = "px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none";
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export default function TermPage() {
  const t = useT();
  const { session, loading } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [dates, setDates] = useState({ startDate: "", endDate: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    const res = await authFetch("/api/term");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error || t("The term could not be loaded."));
    setData(body);
    if (body.terms.current && !body.terms.current.lockedAt) setDates({ startDate: body.terms.current.startDate, endDate: body.terms.current.endDate });
  }, [t]);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  const saveDates = async (mode: "edit" | "new") => {
    if (mode === "new" && data?.terms.current && !confirm(t("Start a new term from {start} to {end}? The current term goes into the history.", { start: dates.startDate, end: dates.endDate }))) return;
    setBusy("dates");
    const res = await authFetch("/api/term", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...dates, mode }) });
    const body = await res.json().catch(() => ({}));
    setToast(res.ok ? { message: t("Term saved"), type: "success" } : { message: body.error || t("That could not be saved."), type: "error" });
    setBusy(null);
    load();
  };

  const act = async (m: Member, action: string) => {
    if (action === "retire" && !confirm(t("Retire {name}? They will not be able to sign in again unless switched back on.", { name: m.name }))) return;
    setBusy(m.id);
    const res = await authFetch("/api/term", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: m.id, action }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setToast({ message: body.error || t("That could not be saved."), type: "error" });
    setBusy(null);
    load();
  };

  if (loading || (!data && !error)) return <div className="p-6">{t("Loading...")}</div>;
  if (!data) return <div className="p-6 text-sm text-gray-700">{error}</div>;

  const cur = data.terms.current;
  const ended = cur && cur.endDate < data.today;
  const locked = data.roster.filter((m) => m.termLocked && !m.retiredAt);

  return (
    <div className="max-w-5xl">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <h1 className="text-2xl font-bold text-dark">{t("SGB or Board Term")}</h1>
      <p className="text-gray-500 text-sm mt-1 mb-6">
        {t("When the term ends, every member is locked out of the portal except Super Admins and anyone ticked to keep access. Setting the term ticks the Principal and Deputy Principal for you (when their People entry is linked to their login). Switch re-elected members back on, and retire those not continuing.")}
      </p>

      <div
        className={`rounded-xl p-5 mb-6 border ${
          !cur ? "bg-gray-50 border-gray-200" : ended ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"
        }`}
      >
        {!cur ? (
          <p className="text-sm">{t("No term is set. Enter the dates of the current term below.")}</p>
        ) : ended ? (
          <p className="text-sm">
            {t("The term ended on {date}.", { date: cur.endDate })}{" "}
            {locked.length
              ? t("{count} members are locked out. Switch on the ones who were re-elected, retire the rest, then start the new term.", { count: locked.length })
              : t("Nobody is waiting. Start the new term below.")}
          </p>
        ) : (
          <p className="text-sm">
            {t("The current term runs from {start} to {end}: {days} days left.", { start: cur.startDate, end: cur.endDate, days: daysBetween(data.today, cur.endDate) })}
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="font-medium text-sm text-gray-500 mb-3">{ended || cur?.lockedAt ? t("NEW TERM") : t("TERM DATES")}</h2>
        <div className="flex gap-4 items-end flex-wrap">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">{t("Starts")}</span>
            <input type="date" value={dates.startDate} onChange={(e) => setDates({ ...dates, startDate: e.target.value })} className={input} />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">{t("Ends")}</span>
            <input type="date" value={dates.endDate} onChange={(e) => setDates({ ...dates, endDate: e.target.value })} className={input} />
          </label>
          {cur && !cur.lockedAt && !ended && (
            <button onClick={() => saveDates("edit")} disabled={busy !== null} className="border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
              {t("Save dates")}
            </button>
          )}
          <button onClick={() => saveDates("new")} disabled={busy !== null} className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {cur ? t("Start a new term") : t("Set the term")}
          </button>
        </div>
        {data.terms.past.length > 0 && (
          <p className="text-xs text-gray-400 mt-3">
            {t("Earlier terms:")} {data.terms.past.map((p) => `${p.startDate} to ${p.endDate}`).join(", ")}
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="px-4 py-3">{t("Name")}</th>
              <th className="px-4 py-3">{t("Position")}</th>
              <th className="px-4 py-3">{t("Access")}</th>
              <th className="px-4 py-3">{t("Keeps access when a term ends")}</th>
              <th className="px-4 py-3 text-right">{t("Action")}</th>
            </tr>
          </thead>
          <tbody>
            {data.roster.map((m) => (
              <tr key={m.id} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-gray-400">{m.email}</p>
                </td>
                <td className="px-4 py-3 text-gray-600">{m.positions.join(", ") || "-"}</td>
                <td className="px-4 py-3">
                  {m.retiredAt ? (
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">{t("Retired")}</span>
                  ) : m.termLocked ? (
                    <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-xs">{t("Locked: term ended")}</span>
                  ) : (
                    <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-xs">{t("Active")}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {m.exempt && m.exempt !== "Keeps access" ? (
                    <span className="text-xs text-gray-500">{t("Always ({why})", { why: m.exempt })}</span>
                  ) : (
                    <input
                      type="checkbox"
                      checked={m.keepsAccessAfterTerm}
                      disabled={busy !== null}
                      onChange={(e) => act(m, e.target.checked ? "keep_access" : "no_keep_access")}
                      aria-label={t("Keeps access when a term ends")}
                    />
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {(m.termLocked || m.retiredAt) && (
                    <button onClick={() => act(m, "switch_on")} disabled={busy !== null} className="text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-50 mr-4">
                      {t("Switch back on")}
                    </button>
                  )}
                  {!m.retiredAt && m.id !== data.me && !m.superAdmin && (
                    <button onClick={() => act(m, "retire")} disabled={busy !== null} className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-50">
                      {t("Retire")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
