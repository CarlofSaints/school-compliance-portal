"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth, authFetch } from "@/lib/useAuth";
import { ACTIVITY_VIEW_PERMISSIONS } from "@/lib/activityAccess";
import { useT } from "@/components/I18nProvider";

interface Row {
  id: string;
  at: string;
  to: string;
  subject: string;
  kind: string;
  ok: boolean;
  error?: string;
  attachments?: string[];
  hasBody: boolean;
  hidden?: "minutes" | "spend";
}

/** "minutes.signing_code" -> "Minutes: signing code". */
function kindLabel(kind: string): string {
  const [area, what] = kind.split(".");
  const words = (s?: string) => (s || "").replace(/_/g, " ");
  const head = words(area);
  return what ? `${head.charAt(0).toUpperCase()}${head.slice(1)}: ${words(what)}` : `${head.charAt(0).toUpperCase()}${head.slice(1)}`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function SentEmailsPage() {
  const t = useT();
  const { session, loading } = useAuth(ACTIVITY_VIEW_PERMISSIONS);
  const [month, setMonth] = useState("");
  const [months, setMonths] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [next, setNext] = useState<string | undefined>();
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<(Row & { html?: string; failed?: boolean }) | null>(null);

  // Without "before" the list is replaced; with it (Show older) the next page
  // is added. Any response overtaken by a newer month load is ignored.
  const loadSeq = useRef(0);
  const load = useCallback(async (m: string, before?: string) => {
    const q = new URLSearchParams();
    if (m) q.set("month", m);
    if (before) q.set("before", before);
    const mine = before ? loadSeq.current : ++loadSeq.current;
    let res: Response;
    try {
      res = await authFetch(`/api/sent-emails?${q}`, { cache: "no-store" });
    } catch {
      if (mine !== loadSeq.current) return;
      setError(t("Could not load the sent emails."));
      setRows((prev) => prev ?? []);
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (mine !== loadSeq.current) return;
    if (!res.ok) {
      // The page's own words, so they are translated.
      setError(t("Could not load the sent emails."));
      // A failed "Show older" keeps the rows already shown.
      if (!before) setRows([]);
      return;
    }
    setError("");
    setMonth(data.month);
    if (data.months) setMonths(data.months);
    setTotal(data.total || 0);
    setNext(data.next);
    setRows((prev) => {
      if (!before) return data.emails || [];
      const seen = new Set((prev || []).map((r) => r.id));
      return [...(prev || []), ...(data.emails || []).filter((r: Row) => !seen.has(r.id))];
    });
  }, [t]);

  useEffect(() => {
    if (session) void load("");
  }, [session, load]);

  // A slow reply for an email clicked earlier must not replace a later one.
  const openSeq = useRef(0);
  const show = async (r: Row) => {
    const mine = ++openSeq.current;
    if (!r.hasBody) return setOpen(r);
    let shown: Row & { html?: string; failed?: boolean };
    try {
      const res = await authFetch(`/api/sent-emails?at=${encodeURIComponent(r.at)}&id=${encodeURIComponent(r.id)}`, { cache: "no-store" });
      shown = res.ok ? await res.json() : { ...r, failed: true };
    } catch {
      shown = { ...r, failed: true };
    }
    if (mine === openSeq.current) setOpen(shown);
  };

  const hiddenText = (why: "minutes" | "spend") =>
    why === "spend"
      ? t("This email is about a fund application you do not have access to.")
      : t("This email is about minutes you do not have access to.");

  if (loading || !session) return null;

  const q = filter.trim().toLowerCase();
  const shown = (rows || []).filter((r) => !q || `${r.to} ${r.subject} ${r.kind}`.toLowerCase().includes(q));

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("Sent emails")}</h1>
          <p className="text-gray-500 mt-1">
            {t("Every email the portal sent, who it went to and whether it was accepted. Codes and private links are blanked out.")}
          </p>
        </div>
        <div className="flex gap-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("Search")}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
          {months.length > 1 && (
            <select value={month} onChange={(e) => void load(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500 w-36">{t("Sent")}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">{t("To")}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">{t("Subject")}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 w-48">{t("Type")}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 w-28">{t("Status")}</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={5} className="px-4 py-6 text-gray-400">{t("Loading...")}</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-gray-400">{q ? t("No loaded emails match your search.") : t("No emails sent yet.")}</td></tr>
            ) : (
              shown.map((r) => (
                <tr key={r.id} onClick={() => void show(r)} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{when(r.at)}</td>
                  <td className="px-4 py-3 text-gray-700">{r.to}</td>
                  <td className={`px-4 py-3 ${r.hidden ? "text-gray-400 italic" : "text-dark"}`}>{r.hidden ? hiddenText(r.hidden) : r.subject || t("Personal email, wording not kept")}</td>
                  <td className="px-4 py-3 text-gray-500">{kindLabel(r.kind)}</td>
                  <td className="px-4 py-3">
                    {r.ok ? (
                      <span className="text-emerald-700">{t("Accepted")}</span>
                    ) : (
                      <span className="text-red-600" title={r.error}>{t("Not sent")}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {rows && next && (
        <button
          onClick={() => void load(month, next)}
          className="mt-4 px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm"
        >
          {t("Show older ({n} more)", { n: total - rows.length })}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { openSeq.current++; setOpen(null); }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 text-sm space-y-1">
              <div className="flex justify-between gap-4">
                <p className="font-semibold text-dark">{open.hidden ? hiddenText(open.hidden) : open.subject || t("Personal email, wording not kept")}</p>
                <button onClick={() => { openSeq.current++; setOpen(null); }} className="text-gray-400 hover:text-gray-600">{t("Close")}</button>
              </div>
              <p className="text-gray-500">{t("To")}: {open.to} · {when(open.at)} · {kindLabel(open.kind)}</p>
              {open.attachments?.length ? <p className="text-gray-500">{t("Attached")}: {open.attachments.join(", ")}</p> : null}
              {!open.ok && open.error && <p className="text-red-600">{open.error}</p>}
            </div>
            {open.html ? (
              // sandbox with no permissions: the stored mail is shown, never run.
              <iframe sandbox="" srcDoc={open.html} title={open.subject || t("Sent emails")} className="w-full flex-1 min-h-[60vh] rounded-b-xl" />
            ) : (
              <p className="p-6 text-gray-500 text-sm">
                {open.hidden
                  ? hiddenText(open.hidden)
                  : open.failed || open.hasBody
                    ? t("Could not open this email. Try again.")
                    : t("This email was written for one person from things only they may see, so its wording is not kept.")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
