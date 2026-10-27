"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState } from "react";
import Toast from "@/components/Toast";
import { GOVERNANCE_LABEL } from "@/lib/positions";
import { useBranding } from "@/components/BrandingProvider";
import { useT } from "@/components/I18nProvider";

export default function BackupPage() {
  const t = useT();
  const branding = useBranding();
  const { session, loading } = useAuth("manage_roles");
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // The server only lists the files; each one is fetched here and the zip is
  // built in the browser, because a function response cannot exceed ~4.5MB.
  // shortcut: the whole zip is held in browser memory, fine to a few hundred
  // MB; stream to disk (showSaveFilePicker) if a school ever outgrows that.
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await authFetch("/api/admin/backup");
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: t("Backup failed") }));
        setToast({ message: body.error || t("Backup failed"), type: "error" });
        return;
      }
      const manifest: {
        prefix: string;
        filename: string;
        chunkBytes: number;
        files: { pathname: string; size: number }[];
      } = await res.json();

      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const skipped: string[] = [];

      // One retry on a server error: one blip must not cost a file.
      const fetchOnce = async (url: string) => {
        let r = await authFetch(url);
        if (r.status >= 500) r = await authFetch(url);
        // Signed out: every later file would fail the same way.
        if (r.status === 401) throw new Error("signed-out");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      };

      for (const [i, file] of manifest.files.entries()) {
        setProgress({ done: i + 1, total: manifest.files.length });
        const base = `/api/admin/backup/file?path=${encodeURIComponent(file.pathname)}`;
        try {
          let data: Blob;
          if (file.size > manifest.chunkBytes) {
            const parts: Blob[] = [];
            for (let p = 0; p * manifest.chunkBytes < file.size; p++) {
              parts.push(await fetchOnce(`${base}&part=${p}`));
            }
            data = new Blob(parts);
            // Parts of a file that changed mid-download would not fit together.
            if (data.size !== file.size) throw new Error(`got ${data.size} of ${file.size} bytes`);
          } else {
            data = await fetchOnce(base);
          }
          // Strip the prefix so zip paths are clean ("roles.json", not "hvps/roles.json").
          zip.file(file.pathname.slice(manifest.prefix.length), data);
        } catch (err) {
          if (err instanceof Error && err.message === "signed-out") throw err;
          skipped.push(`${file.pathname} (${err instanceof Error ? err.message : "failed"})`);
        }
      }

      // A backup that quietly leaves files out is worse than none: list them.
      if (skipped.length) {
        zip.file(
          "SKIPPED-FILES.txt",
          `These ${skipped.length} file(s) could not be read and are NOT in this backup:\n\n${skipped.join("\n")}\n`
        );
      }

      setProgress(null);
      const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = manifest.filename || `${branding.key}-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setToast(
        skipped.length
          ? {
              message: t("Backup downloaded, but {count} file(s) could not be read. They are listed in SKIPPED-FILES.txt inside the zip.", { count: skipped.length }),
              type: "error",
            }
          : { message: t("Backup downloaded successfully"), type: "success" }
      );
    } catch {
      setToast({ message: t("Failed to download backup"), type: "error" });
    } finally {
      setDownloading(false);
      setProgress(null);
    }
  };

  if (loading || !session) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("Backup Data")}</h1>
        <p className="text-gray-500 mt-1">
          {t("Download a complete backup of all application data")}
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 max-w-2xl">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">
          {t("What's included")}
        </h2>
        <ul className="text-sm text-gray-600 space-y-1 mb-6 list-disc list-inside">
          <li>{t("Users, roles & permissions")}</li>
          <li>{t("Policies & policy versions")}</li>
          <li>{t("Compliance guidelines")}</li>
          <li>{t("Documents & compliance results")}</li>
          <li>{t("People ({label} members)", { label: GOVERNANCE_LABEL })}</li>
          <li>{t("Spend requests & settings")}</li>
          <li>{t("Audit logs")}</li>
          <li>{t("User avatars")}</li>
        </ul>

        <p className="text-xs text-gray-400 mb-6">
          {t("The backup is a ZIP file containing all data stored in Vercel Blob storage. JSON files are included as text; images are included as binary files.")}
        </p>
        <p className="text-xs text-gray-400 mb-6">
          {t("A large school can take a few minutes. Keep this page open until the download starts.")}
        </p>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className={`px-6 py-3 rounded-lg text-white font-medium transition-colors ${
            downloading
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-emerald-600 hover:bg-emerald-700"
          }`}
        >
          {downloading ? (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              {progress
                ? t("Downloading file {done} of {total}...", progress)
                : t("Preparing backup...")}
            </span>
          ) : (
            t("Download Backup")
          )}
        </button>
      </div>
    </>
  );
}
