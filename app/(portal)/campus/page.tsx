"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth, authFetch } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";
import { CopyLinkButton, DraftPill, stepHref, type Catalogue } from "@/components/trainingUi";
import { MODULE_COLOURS, type ModuleColour } from "@/lib/trainingTopics";

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

  // While free courses are still being translated in the background, look again every 30 seconds (for up to 10 minutes).
  const translating = data?.translating ?? 0;
  useEffect(() => {
    if (!translating) return;
    let tries = 0;
    const timer = setInterval(() => (++tries > 20 ? clearInterval(timer) : load()), 30_000);
    return () => clearInterval(timer);
  }, [translating > 0, load]); // eslint-disable-line react-hooks/exhaustive-deps

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

      {translating > 0 && (
        <p className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          {t("{n} lessons and tests are still being translated into your language. They appear in English until they are done, and this page updates by itself.", { n: translating })}
        </p>
      )}

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
          const c = MODULE_COLOURS[m.colour as ModuleColour] ?? MODULE_COLOURS.violet;
          const complete = m.items.length > 0 && m.doneCount === m.items.length;
          return (
            <div key={m.id} id={`module-${m.id}`} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden scroll-mt-20">
              <div className={`${c.band} px-5 py-4 flex items-center gap-4 text-white`}>
                <span className="text-4xl leading-none" aria-hidden>{m.icon}</span>
                <div className="min-w-0 flex-1">
                  {m.topic && <p className="text-xs font-semibold uppercase tracking-wide text-white/80">{m.topic}</p>}
                  <h2 className="font-bold text-lg leading-snug">
                    {m.title}
                    {m.status !== "published" && <DraftPill />}
                  </h2>
                </div>
                {complete && <span className="text-3xl" title={t("Completed")}>🏆</span>}
              </div>
              <div className="p-5">
                {m.description && <p className="text-sm text-gray-600">{m.description}</p>}
                <div className="flex gap-2 mt-3">
                  <CopyLinkButton path={`/campus#module-${m.id}`} />
                  {data.canManage && (
                    <Link href={`/campus/manage/modules/${m.id}`} className="border border-gray-200 bg-white text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50">
                      ✏️ {t("Edit")}
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <div className="h-2 flex-1 bg-gray-100 rounded-full">
                    <div className={`h-2 ${c.bar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={`text-xs font-semibold ${c.text} whitespace-nowrap`}>
                    {t("{done} of {total} done", { done: m.doneCount, total: m.items.length })}
                  </span>
                </div>
                <ol className="mt-4 space-y-1.5">
                  {m.items.map((s, i) =>
                    s.locked ? (
                      <li key={`${s.kind}:${s.id}`} className="flex items-center gap-3 text-sm text-gray-400 px-3 py-2 rounded-lg bg-gray-50" title={t("Finish the earlier steps first")}>
                        <span className="text-lg w-6 text-center" aria-hidden>🔒</span>
                        <span className="flex-1">{i + 1}. {s.title}</span>
                      </li>
                    ) : (
                      <li key={`${s.kind}:${s.id}`}>
                        <Link href={stepHref(s, m.id)} className={`flex items-center gap-3 text-sm px-3 py-2 rounded-lg ${c.hover} ${s.done ? c.soft : ""}`}>
                          <span className="text-lg w-6 text-center" aria-hidden>{s.icon}</span>
                          <span className="flex-1 text-gray-800">{i + 1}. {s.title}</span>
                          {s.minutes ? (
                            <span className="text-xs text-gray-400 whitespace-nowrap">
                              {s.kind === "test" ? `⏱ ${t("{n} min", { n: s.minutes })}` : `~${t("{n} min", { n: s.minutes })}`}
                            </span>
                          ) : null}
                          <span className={`text-xs font-medium ${s.done ? "text-emerald-600" : "text-gray-400"}`}>
                            {s.done ? (s.kind === "test" ? t("Passed") : t("Read")) : s.kind === "test" ? t("Test") : t("Lesson")}
                          </span>
                        </Link>
                      </li>
                    )
                  )}
                </ol>
              </div>
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
