"use client";

import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/useAuth";
import DownloadLink from "@/components/DownloadLink";
import { PLACEHOLDERS } from "@/lib/letterhead";

// ---------------------------------------------------------------------------
// The school's own Word letterhead.
//
// Its own card and its own save, separate from the rest of branding: a file
// upload that shares a Save button with six text fields makes people wonder
// whether their file went, and makes a failed upload look like a failed save.
// ---------------------------------------------------------------------------

interface Meta {
  filename: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
  placeholders: string[];
}

export default function LetterheadUpload({
  onToast,
}: {
  onToast: (message: string, type: "success" | "error") => void;
}) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await authFetch("/api/branding/letterhead");
    if (res.ok) setMeta(await res.json());
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(file: File) {
    setBusy(true);
    setProblem(null);
    try {
      const form = new FormData();
      form.append("file", file);
      // No Content-Type: the browser sets the multipart boundary, and naming
      // the type by hand leaves it off and the body unparseable.
      const res = await authFetch("/api/branding/letterhead", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Kept on the page rather than only in a toast. This message tells
        // somebody to go and edit their letterhead in Word, which is not a
        // thing to read once while it fades out.
        setProblem(data.error || "That letterhead could not be uploaded.");
        return;
      }
      setMeta(data);
      onToast("Letterhead saved. New minutes will be built on it.", "success");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await authFetch("/api/branding/letterhead", { method: "DELETE" });
      if (!res.ok) {
        onToast("Could not remove the letterhead.", "error");
        return;
      }
      setMeta(null);
      setProblem(null);
      onToast("Letterhead removed. Documents go back to the standard layout.", "success");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-6">
      <h2 className="text-sm font-semibold text-dark mb-1">Word letterhead</h2>
      <p className="text-sm text-gray-500 mb-4">
        Upload the school&apos;s own Word letterhead and documents are built on it: your crest,
        your fonts, your wording, unchanged. Without one, documents use a standard layout with
        the crest and colours from above.
      </p>

      {meta ? (
        <div className="rounded-lg border border-gray-200 p-4 mb-4">
          <p className="text-sm">
            <DownloadLink
              href="/api/branding/letterhead?file=1"
              filename={meta.filename}
              className="text-primary hover:underline font-medium"
              onError={(message) => onToast(message, "error")}
            >
              {meta.filename}
            </DownloadLink>
            <span className="text-gray-400">
              {" "}
              ({(meta.size / 1024).toFixed(0)}KB), uploaded{" "}
              {new Date(meta.uploadedAt).toLocaleDateString("en-ZA", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}{" "}
              by {meta.uploadedBy}
            </span>
          </p>
          {/* Which markers THIS file actually has, so a school can see what it
              will and will not fill in without having to guess. */}
          <div className="flex flex-wrap gap-1 mt-3">
            {PLACEHOLDERS.map((p) => {
              const on = meta.placeholders.includes(p.name);
              return (
                <span
                  key={p.name}
                  title={p.what}
                  className={`text-[11px] px-2 py-0.5 rounded-full font-mono ${
                    on ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {`{{${p.name}}}`}
                  {on ? "" : " · not used"}
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 p-4 mb-4 text-sm text-gray-500">
          No letterhead uploaded. Documents use the standard layout.
        </div>
      )}

      {problem && (
        <div className="rounded-lg bg-amber-50 border-l-3 border-amber-400 px-4 py-3 mb-4 text-sm text-amber-900">
          {problem}
        </div>
      )}

      <details className="mb-4">
        <summary className="text-sm text-primary cursor-pointer hover:underline">
          How to prepare your letterhead
        </summary>
        <div className="mt-3 text-sm text-gray-600 space-y-2">
          <p>
            Open your letterhead in Word and type{" "}
            <code className="bg-gray-100 px-1 rounded font-mono text-xs">{"{{content}}"}</code> on
            its own line, where the numbered items should go. Save it as .docx and upload it
            here. Everything else in the file is left exactly as it is.
          </p>
          <p>These are optional, and anywhere you put them they get filled in:</p>
          <ul className="space-y-1">
            {PLACEHOLDERS.filter((p) => p.name !== "content").map((p) => (
              <li key={p.name}>
                <code className="bg-gray-100 px-1 rounded font-mono text-xs">{`{{${p.name}}}`}</code>{" "}
                <span className="text-gray-500">{p.what}</span>
              </li>
            ))}
          </ul>
          <p className="text-gray-500">
            Anything you leave out keeps whatever your letterhead already says there.
          </p>
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        <label className="inline-block">
          <input
            type="file"
            accept=".docx"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              // Cleared straight away, so re-choosing the same file after a
              // failed upload still fires a change event.
              e.target.value = "";
              if (f) upload(f);
            }}
            className="hidden"
          />
          <span className="inline-block cursor-pointer bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors">
            {busy ? "Uploading..." : meta ? "Replace letterhead" : "Upload a letterhead"}
          </span>
        </label>
        {meta && (
          <button
            onClick={remove}
            disabled={busy}
            className="px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
