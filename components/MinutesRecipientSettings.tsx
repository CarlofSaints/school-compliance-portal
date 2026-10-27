"use client";

import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/useAuth";
import { tk } from "@/lib/i18n/translate";
import { useT } from "@/components/I18nProvider";
import { AudienceLine } from "@/components/AudiencePreview";

// Which tag means which minutes list.
//
// 🔴 Tags are chosen, not named. A school makes its own tags and says which one
// means "check this draft"; matching on a tag NAME would break the moment
// somebody renamed it, capitalised it differently or made one in Afrikaans.
//
// Every list shows WHO it currently resolves to. A distribution list nobody has
// looked at is how a governor quietly stops receiving the minutes.

const AUDIENCES = [
  {
    key: "draft",
    label: tk("Draft, out for checking"),
    help: tk("Who checks a draft. Usually the Principal and the Chairperson, with the deputy copied in."),
  },
  {
    key: "signing",
    label: tk("Ready to sign"),
    help: tk("Who is asked to sign once the draft has been approved."),
  },
  {
    key: "signed",
    label: tk("Signed and final"),
    help: tk("Who is told when a set of minutes has been fully signed."),
  },
  { key: "sgb", label: tk("All SGB / Board minutes"), help: tk("Everyone who should receive signed SGB / Board minutes.") },
  {
    key: "fincom",
    label: tk("All FINCOM minutes"),
    help: tk("Everyone who should receive signed FINCOM minutes."),
  },
] as const;

type AudienceKey = (typeof AUDIENCES)[number]["key"];

interface Preview {
  to: string[];
  cc: string[];
  withoutEmail: string[];
}

export default function MinutesRecipientSettings({
  onSaved,
  onError,
}: {
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const t = useT();
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const [to, setTo] = useState<Partial<Record<AudienceKey, string>>>({});
  const [cc, setCc] = useState<Partial<Record<AudienceKey, string>>>({});
  const [preview, setPreview] = useState<Record<string, Preview>>({});
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await authFetch("/api/minutes-recipients");
      if (!res.ok) return;
      const data = await res.json();
      setTags(data.tags || []);
      setTo(data.settings?.to || {});
      setCc(data.settings?.cc || {});
      setPreview(data.preview || {});
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await authFetch("/api/minutes-recipients", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, cc }),
      });
      if (!res.ok) {
        onError(t("Could not save who receives minutes."));
        return;
      }
      onSaved(t("Saved who receives minutes."));
      // Reloaded so the preview reflects the tags just chosen rather than the
      // ones that were set when the page opened.
      load();
    } finally {
      setSaving(false);
    }
  };

  if (busy) return <p className="text-sm text-gray-400">{t("Loading...")}</p>;

  const selectClass =
    "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition";

  return (
    <div className="space-y-4">
      {tags.length === 0 && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t("There are no tags yet. Create them under Admin, Tags first, then come back and say which one means what.")}
        </div>
      )}

      {AUDIENCES.map((a) => {
        const p = preview[a.key];
        return (
          <div key={a.key} className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-sm font-semibold text-dark">{t(a.label)}</p>
            <p className="text-xs text-gray-500 mt-1 mb-3">{t(a.help)}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {t("Send to")}
                </label>
                <select
                  value={to[a.key] ?? ""}
                  onChange={(e) => setTo({ ...to, [a.key]: e.target.value || undefined })}
                  className={selectClass}
                >
                  <option value="">{t("Nobody yet")}</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {t("Copy in")}
                </label>
                <select
                  value={cc[a.key] ?? ""}
                  onChange={(e) => setCc({ ...cc, [a.key]: e.target.value || undefined })}
                  className={selectClass}
                >
                  <option value="">{t("Nobody")}</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {p && <AudienceLine p={p} />}
          </div>
        );
      })}

      <button
        onClick={save}
        disabled={saving}
        className="bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
      >
        {saving ? t("Saving...") : t("Save recipients")}
      </button>
    </div>
  );
}
