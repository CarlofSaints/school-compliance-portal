"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth, authFetch } from "@/lib/useAuth";
import Toast from "@/components/Toast";
import SchoolBrandingFields, {
  type BrandingValue,
} from "@/components/SchoolBrandingFields";
import { useBranding } from "@/components/BrandingProvider";

export default function BrandingPage() {
  const { session, loading } = useAuth("manage_users");
  const branding = useBranding();

  const [value, setValue] = useState<BrandingValue>({
    logoDataUrl: null,
    logoFilename: null,
    primary: branding.colors.primary,
    accent: branding.colors.accent,
  });
  const [fullName, setFullName] = useState(branding.fullName);
  const [shortName, setShortName] = useState(branding.shortName);
  const [hadLogo, setHadLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await authFetch("/api/branding");
      const stored = res.ok ? await res.json() : {};
      setFullName(stored.fullName || branding.fullName);
      setShortName(stored.shortName || branding.shortName);
      setValue({
        // The existing crest is shown by URL, not as a data URL. Only a NEWLY
        // chosen file produces a data URL, which is how the save route tells
        // "they picked a new one" from "they left it alone".
        logoDataUrl: stored.logo ? `/api/branding/logo?v=${stored.logo.version}` : null,
        logoFilename: stored.logo?.filename ?? null,
        primary: stored.primary || branding.colors.primary,
        accent: stored.accent || branding.colors.accent,
      });
      setHadLogo(!!stored.logo);
    } finally {
      setBusy(false);
    }
    // branding is the fallback for a school that has never saved anything.
  }, [branding]);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await authFetch("/api/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          shortName,
          primary: value.primary,
          accent: value.accent,
          // Only send the image when it is a newly chosen file. Re-sending the
          // existing one on every save would rewrite the crest and bump its
          // version for nothing, busting every cached copy.
          logoDataUrl: value.logoDataUrl?.startsWith("data:") ? value.logoDataUrl : undefined,
          logoFilename: value.logoFilename,
          removeExistingLogo: hadLogo && value.logoDataUrl === null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ message: data.error || "Could not save.", type: "error" });
        return;
      }
      setToast({
        message: "Saved. Reload any open page to see the new look.",
        type: "success",
      });
      setHadLogo(!!data.logo);
      if (data.logo) {
        setValue((v) => ({
          ...v,
          logoDataUrl: `/api/branding/logo?v=${data.logo.version}`,
        }));
      }
    } catch {
      setToast({ message: "Could not save.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !session) return null;

  return (
    <div className="p-6 max-w-3xl">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">School branding</h1>
        <p className="text-gray-500 mt-1">
          Your crest and colours, used across the portal, on reports and in every
          email it sends.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
        {busy ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  School name
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  The full name, as it should appear on reports and emails.
                </p>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Short name
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  The acronym used in the sidebar and in tight spaces.
                </p>
                <input
                  type="text"
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                />
              </div>
            </div>

            <SchoolBrandingFields
              value={value}
              onChange={setValue}
              schoolName={shortName || fullName}
            />

            <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
              <button
                onClick={save}
                disabled={saving}
                className="bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save branding"}
              </button>
              <button
                onClick={load}
                disabled={saving}
                className="px-5 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Discard changes
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
