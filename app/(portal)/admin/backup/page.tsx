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
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await authFetch("/api/admin/backup");
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: t("Backup failed") }));
        setToast({ message: body.error || t("Backup failed"), type: "error" });
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Extract filename from Content-Disposition or use default
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="(.+)"/);
      a.download = match?.[1] || `${branding.key}-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setToast({ message: t("Backup downloaded successfully"), type: "success" });
    } catch {
      setToast({ message: t("Failed to download backup"), type: "error" });
    } finally {
      setDownloading(false);
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
              {t("Preparing backup...")}
            </span>
          ) : (
            t("Download Backup")
          )}
        </button>
      </div>
    </>
  );
}
