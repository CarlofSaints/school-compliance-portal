"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import { downloadWithAuth } from "@/lib/download";
import { useT } from "@/components/I18nProvider";
import LessonText from "@/components/LessonText";
import { DraftPill } from "@/components/trainingUi";

interface MaterialView {
  id: string;
  title: string;
  description: string;
  status: string;
  kind: "text" | "file";
  body: string;
  file?: { filename: string; size: number };
}

export default function MaterialPage() {
  const t = useT();
  const { session, loading } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [m, setM] = useState<MaterialView | null>(null);
  const [error, setError] = useState("");
  const [moduleId, setModuleId] = useState("");

  useEffect(() => {
    setModuleId(new URLSearchParams(window.location.search).get("module") || "");
  }, []);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const res = await authFetch(`/api/training/materials/${id}`);
      const body = await res.json().catch(() => ({}));
      if (res.ok) setM(body);
      else setError(body.error || t("This material could not be opened."));
    })();
  }, [session, id, t]);

  if (loading || (!m && !error)) return <div className="p-6">{t("Loading...")}</div>;

  return (
    <div className="max-w-3xl">
      <Link href="/campus" className="text-sm text-primary">&larr; {t("Back to Campus")}</Link>
      {!m ? (
        <p className="mt-4 text-sm text-gray-700">{error}</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-3">
          <h1 className="text-2xl font-bold text-dark">
            {m.title}
            {m.status !== "published" && <DraftPill />}
          </h1>
          {m.description && <p className="text-gray-500 text-sm mt-1">{m.description}</p>}
          <div className="mt-5">
            {m.body && <LessonText body={m.body} />}
            {m.file && (
              <button
                onClick={async () => {
                  const r = await downloadWithAuth(`/api/training/materials/${m.id}/file`, m.file!.filename);
                  if (!r.ok) setError(r.error || "");
                }}
                className="mt-4 bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                {t("Open {name}", { name: m.file.filename })}
              </button>
            )}
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          </div>
          <div className="mt-6 pt-4 border-t border-gray-100 flex justify-between items-center">
            <span className="text-xs text-emerald-600">{t("Marked as read")}</span>
            <Link href="/campus" className="text-sm font-medium text-primary">
              {moduleId ? t("Next step") : t("Back to Campus")} &rarr;
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
