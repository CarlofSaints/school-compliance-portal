"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth, authFetch } from "@/lib/useAuth";
import Toast from "@/components/Toast";
import SchoolBrandingFields, {
  type BrandingValue,
} from "@/components/SchoolBrandingFields";
import { useBranding } from "@/components/BrandingProvider";
import { useT } from "@/components/I18nProvider";
import { MAX_WORD_FOOTER, MAX_WORD_FOOTER_LINES } from "@/lib/branding";

export default function BrandingPage() {
  const t = useT();
  const { session, loading } = useAuth("manage_users");
  const branding = useBranding();
  // The From header the server actually builds, so this preview cannot drift
  // from what really goes out. Everything inside the angle brackets.
  const sendingAddress =
    /<([^>]+)>/.exec(branding.fromEmail)?.[1] ?? branding.fromEmail;

  const [value, setValue] = useState<BrandingValue>({
    logoDataUrl: null,
    logoFilename: null,
    primary: branding.colors.primary,
    accent: branding.colors.accent,
  });
  const [fullName, setFullName] = useState(branding.fullName);
  const [shortName, setShortName] = useState(branding.shortName);
  const [replyTo, setReplyTo] = useState("");
  const [wordFooter, setWordFooter] = useState("");
  const [hadLogo, setHadLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(true);
  // A failed load used to fall through to the built-in defaults, which a Save
  // then wrote over the school's real name, short name and reply-to address.
  const [loadError, setLoadError] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await authFetch("/api/branding");
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      setLoadError(false);
      const stored = await res.json();
      setFullName(stored.fullName || branding.fullName);
      setShortName(stored.shortName || branding.shortName);
      setReplyTo(stored.replyTo || "");
      setWordFooter(stored.wordFooter || "");
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
    } catch {
      // A dropped connection THROWS rather than returning a bad response.
      setLoadError(true);
    } finally {
      setBusy(false);
    }
    // branding is the fallback for a school that has never saved anything.
  }, [branding]);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  const save = async () => {
    if (loadError) return;
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
          replyTo,
          wordFooter,
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
        setToast({ message: data.error || t("Could not save."), type: "error" });
        return;
      }
      setToast({
        message: t("Saved. Reload any open page to see the new look."),
        type: "success",
      });
      setHadLogo(!!data.logo);
      // Show what the server actually stored (cleaned, cut to the caps).
      setWordFooter(data.wordFooter || "");
      if (data.logo) {
        setValue((v) => ({
          ...v,
          logoDataUrl: `/api/branding/logo?v=${data.logo.version}`,
        }));
      }
    } catch {
      setToast({ message: t("Could not save."), type: "error" });
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
      {loadError && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {t("The saved branding settings could not be loaded, so saving is switched off to protect them. Refresh the page to try again.")}
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">{t("School branding")}</h1>
        <p className="text-gray-500 mt-1">
          {t("Your crest and colours, used across the portal, on reports and in every email it sends.")}
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
        {busy ? (
          <p className="text-sm text-gray-500">{t("Loading...")}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("School name")}
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  {t("The full name, as it should appear on reports and emails.")}
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
                  {t("Short name")}
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  {t("The acronym used in the sidebar and in tight spaces.")}
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

            <div className="pt-6 border-t border-gray-100">
              <h2 className="text-sm font-semibold text-dark mb-1">{t("Email")}</h2>
              <p className="text-xs text-gray-500 mb-4">
                {t("How reminders, approvals and sign-in emails appear to whoever receives them.")}
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("Emails are sent from")}
                </label>
                <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 font-mono break-all">
                  {(fullName || t("Your school")) + " <" + (sendingAddress || "noreply@…") + ">"}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {t("Your school's name is the part people see. The address itself is fixed, because a sending domain has to be verified with our email provider before anything it sends will be delivered. If each school typed its own, its email would quietly land in spam.")}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("Replies go to")}
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  {t("Nobody reads a no-reply mailbox. Put a real address here and a reply to any of these emails reaches a person. Leave it blank and replies go nowhere.")}
                </p>
                <input
                  type="email"
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  placeholder="sgb@yourschool.co.za"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                />
              </div>
            </div>

            <div className="pt-6 border-t border-gray-100">
              <label htmlFor="word-footer" className="block text-sm font-medium text-gray-700 mb-1">
                {t("Footer on Word minutes")}
              </label>
              <p className="text-xs text-gray-500 mb-2">
                {t("For example directors' names, address or registration number. Leave empty for no footer.")}{" "}
                {t("Up to {lines} lines.", { lines: MAX_WORD_FOOTER_LINES })}
              </p>
              <textarea
                id="word-footer"
                value={wordFooter}
                onChange={(e) => setWordFooter(e.target.value)}
                maxLength={MAX_WORD_FOOTER}
                rows={3}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{Array.from(wordFooter).length}/{MAX_WORD_FOOTER}</p>
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
              <button
                onClick={save}
                disabled={saving || loadError}
                className="bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? t("Saving...") : t("Save branding")}
              </button>
              <button
                onClick={load}
                disabled={saving}
                className="px-5 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {t("Discard changes")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
