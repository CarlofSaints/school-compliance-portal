"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/components/I18nProvider";
import LessonText from "@/components/LessonText";
import { CopyLinkButton, DraftPill } from "@/components/trainingUi";

interface MaterialView {
  id: string;
  title: string;
  description: string;
  status: string;
  kind: "text" | "file";
  body: string;
  icon?: string;
  file?: { filename: string; size: number };
  minutes: number;
}

/**
 * A lesson, for a portal user (api "/api/training") or a share-link guest
 * (api "/api/share/<token>"). Opening it is what records it as read.
 */
export default function LessonView(props: {
  id: string;
  api: string;
  fetcher: (url: string, init?: RequestInit) => Promise<Response>;
  ready: boolean;
  backHref: string;
  backLabel: string;
  /** Where "Next step" goes; the back link when there is none. */
  nextHref: string;
  /** Called once the lesson has loaded (and so been recorded as read). */
  onLoaded?: () => void;
  openFile: (url: string, filename: string) => Promise<string | null>;
  copyPath?: string;
  editHref?: string;
}) {
  const t = useT();
  const { id, api, fetcher, ready, onLoaded } = props;
  const [m, setM] = useState<MaterialView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const res = await fetcher(`${api}/materials/${id}`);
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setM(body);
        onLoaded?.();
      } else setError(body.error || t("This material could not be opened."));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, id, api]);

  if (!m && !error) return <div className="p-6">{t("Loading...")}</div>;

  return (
    <div className="max-w-3xl">
      <Link href={props.backHref} className="text-sm text-primary">&larr; {props.backLabel}</Link>
      {!m ? (
        <p className="mt-4 text-sm text-gray-700">{error}</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-3">
          <h1 className="text-2xl font-bold text-dark">
            {m.icon && <span className="mr-2" aria-hidden>{m.icon}</span>}
            {m.title}
            {m.status !== "published" && <DraftPill />}
          </h1>
          {m.description && <p className="text-gray-500 text-sm mt-1">{m.description}</p>}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {m.body && <span className="text-xs text-gray-500 mr-2">📖 {t("About {n} minutes to read", { n: m.minutes })}</span>}
            {props.copyPath && <CopyLinkButton path={props.copyPath} />}
            {props.editHref && (
              <Link href={props.editHref} className="border border-gray-200 bg-white text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50">
                ✏️ {t("Edit")}
              </Link>
            )}
          </div>
          <div className="mt-5">
            {m.body && <LessonText body={m.body} />}
            {m.file && (
              <button
                onClick={async () => setError((await props.openFile(`${api}/materials/${m.id}/file`, m.file!.filename)) ?? "")}
                className="mt-4 bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                {t("Open {name}", { name: m.file.filename })}
              </button>
            )}
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          </div>
          <div className="mt-6 pt-4 border-t border-gray-100 flex justify-between items-center">
            <span className="text-xs text-emerald-600">{t("Marked as read")}</span>
            <Link href={props.nextHref} className="text-sm font-medium text-primary">
              {props.nextHref !== props.backHref ? t("Next step") : props.backLabel} &rarr;
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
