"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth, authFetch } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";
import { DraftPill, stepHref, type Catalogue } from "@/components/trainingUi";

export default function TrainingPage() {
  const t = useT();
  const { session, loading } = useAuth();
  const [data, setData] = useState<Catalogue | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await authFetch("/api/training");
    if (res.ok) setData(await res.json());
    else setError(t("Campus could not be loaded. Try again."));
  }, [t]);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  if (loading || (!data && !error)) return <div className="p-6">{t("Loading...")}</div>;
  if (!data) return <div className="p-6 text-sm text-gray-700">{error}</div>;

  // Pieces that sit in no module are listed on their own.
  const inModule = new Set(data.modules.flatMap((m) => m.items.map((i) => `${i.kind}:${i.id}`)));
  const looseMaterial = data.materials.filter((m) => !inModule.has(`material:${m.id}`));
  const looseTests = data.tests.filter((x) => !inModule.has(`test:${x.id}`));

  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("Campus")}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {t("Learn the BELA Act, the Schools Act and your province's guidelines, then test yourself.")}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/campus/leaderboard" className="border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            {t("Leaderboard")}
          </Link>
          {data.canManage && (
            <Link href="/campus/manage" className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium">
              {t("Manage Campus")}
            </Link>
          )}
        </div>
      </div>

      {data.modules.length === 0 && looseMaterial.length === 0 && looseTests.length === 0 && (
        <p className="text-sm text-gray-500 bg-white rounded-xl border border-gray-100 p-6">
          {data.canManage
            ? t("Nothing on Campus yet. Press Manage Campus to build a module with AI or load your own.")
            : t("Nothing has been published on Campus yet.")}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.modules.map((m) => {
          const pct = m.items.length ? Math.round((m.doneCount / m.items.length) * 100) : 0;
          return (
            <div key={m.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-dark">
                    {m.title}
                    {m.status !== "published" && <DraftPill />}
                  </h2>
                  {m.topic && <p className="text-xs text-gray-400 mt-0.5">{m.topic}</p>}
                </div>
                <span className="text-xs font-medium text-gray-500 whitespace-nowrap">
                  {t("{done} of {total} done", { done: m.doneCount, total: m.items.length })}
                </span>
              </div>
              {m.description && <p className="text-sm text-gray-600 mt-2">{m.description}</p>}
              <div className="h-1.5 bg-gray-100 rounded-full mt-3">
                <div className="h-1.5 bg-primary rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <ol className="mt-4 space-y-1">
                {m.items.map((s, i) => (
                  <li key={`${s.kind}:${s.id}`}>
                    {s.locked ? (
                      <span className="flex items-center gap-2 text-sm text-gray-400 py-1" title={t("Finish the earlier steps first")}>
                        <span className="w-5 text-center">🔒</span>
                        {i + 1}. {s.title}
                      </span>
                    ) : (
                      <Link href={stepHref(s, m.id)} className="flex items-center gap-2 text-sm text-gray-700 hover:text-primary py-1">
                        <span className={`w-5 text-center ${s.done ? "text-emerald-600" : "text-gray-300"}`}>{s.done ? "✓" : "○"}</span>
                        {i + 1}. {s.title}
                        <span className="text-xs text-gray-400">{s.kind === "test" ? t("Test") : t("Lesson")}</span>
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>

      {(looseMaterial.length > 0 || looseTests.length > 0) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mt-6">
          <h2 className="font-medium text-sm text-gray-500 p-4 border-b border-gray-100">{t("OTHER MATERIAL AND TESTS")}</h2>
          {looseMaterial.map((m) => (
            <Link key={m.id} href={stepHref({ kind: "material", id: m.id })} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 hover:bg-gray-50 text-sm">
              <span>
                {m.title}
                {m.status !== "published" && <DraftPill />}
              </span>
              <span className={m.done ? "text-emerald-600 text-xs" : "text-gray-400 text-xs"}>{m.done ? t("Read") : t("Lesson")}</span>
            </Link>
          ))}
          {looseTests.map((x) => (
            <Link key={x.id} href={stepHref({ kind: "test", id: x.id })} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-sm">
              <span>
                {x.title}
                {x.status !== "published" && <DraftPill />}
              </span>
              <span className={x.done ? "text-emerald-600 text-xs" : "text-gray-400 text-xs"}>
                {x.bestPct !== null ? t("Best {pct}%", { pct: x.bestPct }) : t("{count} questions", { count: x.questionCount })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
