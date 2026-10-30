"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth, authFetch } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";
import Toast from "@/components/Toast";
import { DraftPill, type Catalogue } from "@/components/trainingUi";

type Kind = "modules" | "materials" | "tests";

export default function ManageTrainingPage() {
  const t = useT();
  const { session, loading } = useAuth("manage_training");
  const [data, setData] = useState<Catalogue | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    const res = await authFetch("/api/training");
    if (res.ok) setData(await res.json());
  }, []);

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
