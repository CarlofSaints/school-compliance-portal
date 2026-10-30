"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth, authFetch } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";
import Toast from "@/components/Toast";
import { DraftPill, type Catalogue } from "@/components/trainingUi";
import { MODULE_COLOURS, type ModuleColour } from "@/lib/trainingTopics";

interface LibraryRow { slug: string; title: string; description: string; topic: string; icon: string; colour: string; lessons: number; questions: number; added: boolean }

type Kind = "modules" | "materials" | "tests";

export default function ManageTrainingPage() {
  const t = useT();
  const { session, loading } = useAuth("manage_training");
  const [data, setData] = useState<Catalogue | null>(null);
  const [library, setLibrary] = useState<LibraryRow[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    const [res, lib] = await Promise.all([authFetch("/api/training"), authFetch("/api/training/library")]);
    if (res.ok) setData(await res.json());
    if (lib.ok) setLibrary(await lib.json());
  }, []);

  const addCourses = async (body: { slug?: string; all?: boolean }) => {
    setAdding(body.slug ?? "all");
    const res = await authFetch("/api/training/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = await res.json().catch(() => ({}));
    setToast(
      res.ok
        ? { message: t("{count} courses added to your Campus and published", { count: out.added ?? 0 }), type: "success" }
        : { message: out.error || t("That could not be added."), type: "error" }
    );
    setAdding(null);
    load();
  };

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  const remove = async (kind: Kind, id: string, title: string) => {
    const warn =
      kind === "modules"
        ? t('Delete the module "{title}"? Its lessons and tests are kept.', { title })
        : t('Delete "{title}"? It is taken out of every module, and for a test its scores stop counting on the leaderboard.', { title });
    if (!confirm(warn)) return;
    const res = await authFetch(`/api/training/${kind}/${id}`, { method: "DELETE" });
    setToast(res.ok ? { message: t("Deleted"), type: "success" } : { message: t("That could not be deleted."), type: "error" });
    load();
  };

  if (loading || !data) return <div className="p-6">{t("Loading...")}</div>;

  const section = (
    kind: Kind,
    heading: string,
    rows: { id: string; title: string; status: string; source?: string; extra: string }[],
    newLabel: string
  ) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <h2 className="font-medium text-sm text-gray-500">{heading} ({rows.length})</h2>
        <Link href={`/campus/manage/${kind}/new`} className="text-sm font-medium text-primary">
          {newLabel}
        </Link>
      </div>
      {rows.length === 0 && <p className="px-4 py-3 text-xs text-gray-400 italic">{t("None yet")}</p>}
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0 text-sm gap-3">
          <Link href={`/campus/manage/${kind}/${r.id}`} className="hover:text-primary">
            {r.title}
            {r.status !== "published" && <DraftPill />}
            {r.source === "ai" && <span className="ml-2 inline-block bg-violet-100 text-violet-700 px-2 py-0.5 rounded text-xs">{t("AI")}</span>}
          </Link>
          <div className="flex items-center gap-4 shrink-0">
            <span className="text-xs text-gray-400">{r.extra}</span>
            <button onClick={() => remove(kind, r.id, r.title)} className="text-xs text-gray-400 hover:text-red-600">
              {t("Delete")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <Link href="/campus" className="text-sm text-primary">&larr; {t("Back to Campus")}</Link>
      <div className="flex items-start justify-between mt-3 mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("Manage Campus")}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {t("Build a module with AI, or load your own material and tests. Nothing reaches anybody until it is published.")}
          </p>
        </div>
        <Link href="/campus/manage/ai" className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium">
          {t("Build a module with AI")}
        </Link>
      </div>
      {library.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-dark">{t("Course library")}</h2>
              <p className="text-sm text-gray-500">
                {t("Ready-made courses with a multiple-choice test each. Adding one copies it into your Campus, published, for you to edit as you like.")}
              </p>
            </div>
            {library.some((c) => !c.added) && (
              <button
                onClick={() => addCourses({ all: true })}
                disabled={adding !== null}
                className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {adding === "all" ? t("Adding...") : t("Add all courses")}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {library.map((c) => {
              const col = MODULE_COLOURS[c.colour as ModuleColour] ?? MODULE_COLOURS.violet;
              return (
                <div key={c.slug} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                  <div className={`${col.band} px-4 py-3 flex items-center gap-3 text-white`}>
                    <span className="text-3xl" aria-hidden>{c.icon}</span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/80">{c.topic}</p>
                      <p className="font-bold leading-snug">{c.title}</p>
                    </div>
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <p className="text-sm text-gray-600 flex-1">{c.description}</p>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-gray-400">
                        {t("{lessons} lessons, {questions} questions", { lessons: c.lessons, questions: c.questions })}
                      </span>
                      {c.added ? (
                        <span className="text-xs font-semibold text-emerald-600">✓ {t("Added")}</span>
                      ) : (
                        <button
                          onClick={() => addCourses({ slug: c.slug })}
                          disabled={adding !== null}
                          className={`text-xs font-semibold ${col.text} disabled:opacity-50`}
                        >
                          {adding === c.slug ? t("Adding...") : t("+ Add to our Campus")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {section(
        "modules",
        t("MODULES"),
        data.modules.map((m) => ({ ...m, extra: t("{count} steps", { count: m.items.length }) })),
        t("+ New module")
      )}
      {section(
        "materials",
        t("MATERIAL"),
        data.materials.map((m) => ({ ...m, extra: "" })),
        t("+ New material")
      )}
      {section(
        "tests",
        t("TESTS"),
        data.tests.map((x) => ({ ...x, extra: t("{count} questions", { count: x.questionCount }) })),
        t("+ New test")
      )}
    </div>
  );
}
