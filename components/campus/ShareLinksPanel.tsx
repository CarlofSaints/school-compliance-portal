"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";
import type { Catalogue } from "@/components/trainingUi";

interface LinkRow {
  token: string;
  kind: "module" | "material" | "test";
  targetId: string;
  label: string;
  expiresOn: string;
  active: boolean;
  createdAt: string;
  target: { title: string; status: string };
  guests: number;
}
interface Results {
  lessons: number;
  rows: { name: string; email: string; joinedAt: string; lessonsRead: number; tests: { title: string; attempts: number; bestPct: number | null; passed: boolean }[] }[];
}

const input = "px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none";

// Share links: Campus training for people WITHOUT a portal account.
export default function ShareLinksPanel({ data, onToast }: { data: Catalogue; onToast: (m: string, type: "success" | "error") => void }) {
  const t = useT();
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [form, setForm] = useState({ target: "", label: "", expiresOn: "" });
  const [open, setOpen] = useState<string | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    const r = await authFetch("/api/training/share");
    if (r.ok) setLinks(await r.json());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const published = [
    ...data.modules.filter((m) => m.status === "published").map((m) => ({ key: `module:${m.id}`, label: `${t("Module")}: ${m.title}` })),
    ...data.materials.filter((m) => m.status === "published").map((m) => ({ key: `material:${m.id}`, label: `${t("Lesson")}: ${m.title}` })),
    ...data.tests.filter((x) => x.status === "published").map((x) => ({ key: `test:${x.id}`, label: `${t("Test")}: ${x.title}` })),
  ];
  const url = (token: string) => `${window.location.origin}/s/${token}`;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const [kind, targetId] = form.target.split(":");
    const r = await authFetch("/api/training/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, targetId, label: form.label, expiresOn: form.expiresOn }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return onToast(body.error || t("That could not be saved."), "error");
    await navigator.clipboard.writeText(url(body.token)).catch(() => {});
    onToast(t("Link made and copied"), "success");
    setForm({ target: "", label: "", expiresOn: "" });
    load();
  };

  const toggle = async (l: LinkRow) => {
    const r = await authFetch(`/api/training/share/${l.token}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !l.active }) });
    if (!r.ok) onToast(t("That could not be saved."), "error");
    load();
  };

  const showResults = async (token: string) => {
    if (open === token) return setOpen(null);
    setOpen(token);
    setResults(null);
    const r = await authFetch(`/api/training/share/${token}`);
    if (r.ok) setResults(await r.json());
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
      <div className="p-4 border-b border-gray-100">
        <h2 className="font-medium text-sm text-gray-500">{t("SHARE LINKS")}</h2>
        <p className="text-xs text-gray-400 mt-1">
          {t("For people without a portal account, such as parents or new governors. Whoever opens the link types their name and email, which nobody checks, so their results are marked \"via link\". People with an account can use Copy link instead.")}
        </p>
      </div>
      <form onSubmit={create} className="p-4 flex gap-3 items-end flex-wrap border-b border-gray-50">
        <label className="block flex-1 min-w-60">
          <span className="block text-xs font-medium text-gray-600 mb-1">{t("What it opens")}</span>
          <select required value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} className={`${input} w-full`}>
            <option value="">{t("Choose published training...")}</option>
            {published.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-600 mb-1">{t("Label (optional)")}</span>
          <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={120} placeholder={t("e.g. New parents 2027")} className={input} />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-600 mb-1">{t("Works until (optional)")}</span>
          <input type="date" value={form.expiresOn} onChange={(e) => setForm({ ...form, expiresOn: e.target.value })} className={input} />
        </label>
        <button className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium">{t("Make link")}</button>
      </form>
      {links.length === 0 && <p className="px-4 py-3 text-xs text-gray-400 italic">{t("None yet")}</p>}
      {links.map((l) => (
        <div key={l.token} className="border-b border-gray-50 last:border-0">
          <div className="flex items-center justify-between px-4 py-3 text-sm gap-3 flex-wrap">
            <div className="min-w-0">
              <p className={l.active ? "" : "text-gray-400 line-through"}>{l.target.title}</p>
              <p className="text-xs text-gray-400">
                {[l.label, l.expiresOn ? t("until {date}", { date: l.expiresOn }) : t("no end date"), t("{n} people", { n: l.guests })].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0 text-xs">
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(url(l.token)).catch(() => {});
                  setCopied(l.token);
                  setTimeout(() => setCopied(""), 2000);
                }}
                className="font-medium text-primary"
              >
                {copied === l.token ? `✓ ${t("Link copied")}` : `🔗 ${t("Copy link")}`}
              </button>
              <button onClick={() => showResults(l.token)} className="text-gray-600 hover:underline">
                {open === l.token ? t("Hide results") : t("Results")}
              </button>
              <button onClick={() => toggle(l)} className={l.active ? "text-gray-400 hover:text-red-600" : "text-emerald-700"}>
                {l.active ? t("Switch off") : t("Switch on")}
              </button>
            </div>
          </div>
          {open === l.token && (
            <div className="px-4 pb-4 overflow-x-auto">
              {!results ? (
                <p className="text-xs text-gray-400">{t("Loading...")}</p>
              ) : results.rows.length === 0 ? (
                <p className="text-xs text-gray-400">{t("Nobody has used this link yet.")}</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="py-1 pr-3">{t("Name (via link)")}</th>
                      <th className="py-1 pr-3">{t("Email")}</th>
                      <th className="py-1 pr-3">{t("Lessons read")}</th>
                      {results.rows[0].tests.map((x) => (
                        <th key={x.title} className="py-1 pr-3">{x.title}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.rows.map((r) => (
                      <tr key={r.email} className="border-t border-gray-50">
                        <td className="py-1 pr-3">{r.name}</td>
                        <td className="py-1 pr-3 text-gray-500">{r.email}</td>
                        <td className="py-1 pr-3">{r.lessonsRead} / {results.lessons}</td>
                        {r.tests.map((x) => (
                          <td key={x.title} className={`py-1 pr-3 ${x.passed ? "text-emerald-700" : ""}`}>
                            {x.bestPct === null ? "-" : `${x.bestPct}%${x.passed ? " ✓" : ""}`}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
