"use client";

import { useEffect, useState } from "react";
import { authFetch, apiErrorMessage } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";
import { AudienceLine } from "@/components/AudiencePreview";
import { MINUTES_STAGES, type MinutesStage } from "@/lib/minutes";
import type { MeetingType } from "@/lib/meetingTypes";

// Admin, Minutes Admin, Who receives minutes.
//
// Carl: "select the meeting type and then Draft out for checking, Ready to
// sign, signed and final... the way it is now is super confusing. i dont know
// how each meeting type differs". So: pick the type first, then its three
// stages, each showing the actual names it reaches.

interface StageView {
  to?: string;
  cc?: string;
  own: boolean;
  to_names: string[];
  cc_names: string[];
  withoutEmail: string[];
}
type Draft = Record<MinutesStage, { to: string; cc: string }>;

export default function MinutesRecipientSettings({
  onSaved,
  onError,
}: {
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const t = useT();
  const [types, setTypes] = useState<MeetingType[]>([]);
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const [byType, setByType] = useState<Record<string, Record<MinutesStage, StageView>>>({});
  const [type, setType] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    authFetch("/api/minutes-recipients", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(await apiErrorMessage(res, t("Could not load who receives minutes.")));
        return res.json();
      })
      .then((d) => {
        if (!live) return;
        setTypes(d.types);
        setTags(d.tags);
        setByType(d.byType);
        setType((cur) => cur || d.types[0]?.id || "");
      })
      .catch((e: Error) => live && setLoadError(e.message));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  // The form follows the type picked; switching type discards unsaved picks.
  const current = byType[type];
  const shown: Draft | null = current
    ? draft ??
      (Object.fromEntries(MINUTES_STAGES.map((s) => [s.key, { to: current[s.key].to ?? "", cc: current[s.key].cc ?? "" }])) as Draft)
    : null;
  const dirty = draft !== null;

  const pickType = (id: string) => {
    if (dirty && !window.confirm(t("Discard the changes you have not saved?"))) return;
    setDraft(null);
    setType(id);
  };

  const set = (stage: MinutesStage, field: "to" | "cc", value: string) =>
    shown && setDraft({ ...shown, [stage]: { ...shown[stage], [field]: value } });

  const save = async () => {
    if (!shown) return;
    setSaving(true);
    try {
      const res = await authFetch("/api/minutes-recipients", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: type, stages: shown }),
      });
      if (!res.ok) {
        onError(await apiErrorMessage(res, t("Could not save who receives minutes.")));
        return;
      }
      onSaved(t("Saved who receives minutes."));
      setDraft(null);
      // Names are worked out by the server from the tags just saved.
      setReload((n) => n + 1);
    } catch {
      onError(t("Could not save who receives minutes."));
    } finally {
      setSaving(false);
    }
  };

  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;
  if (!shown || !current) return <p className="text-sm text-gray-400">{t("Loading...")}</p>;

  const selectClass =
    "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition";
  const typeName = (id: string) => t(types.find((x) => x.id === id)?.label ?? id);

  return (
    <div className="space-y-4">
      {tags.length === 0 && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t("There are no tags yet. Create them under Admin, Tags first, then come back and say which one means what.")}
        </div>
      )}

      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">{t("Which meeting?")}</p>
        <div className="flex flex-wrap gap-2">
          {types.map((ty) => (
            <button
              key={ty.id}
              type="button"
              onClick={() => pickType(ty.id)}
              className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                ty.id === type ? "bg-primary text-white border-primary" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {t(ty.label)}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-gray-500">
        {t("Who gets the {name} minutes at each stage. Each list is the people who carry the tag you pick, so adding someone to the tag adds them here.", { name: typeName(type) })}
      </p>

      {MINUTES_STAGES.map((s, i) => {
        const v = current[s.key];
        return (
          <div key={s.key} className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-dark">
                {i + 1}. {t(s.label)}
              </p>
              {!v.own && !dirty && (
                // Never saved for this type yet: it still follows the old school-wide list.
                <span className="text-xs text-gray-400">{t("Using the school-wide setting until you save")}</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1 mb-3">{t(s.help)}</p>

            <div className={`grid grid-cols-1 gap-3 ${s.hasCc ? "sm:grid-cols-2" : ""}`}>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t("Send to (tag)")}</label>
                <select value={shown[s.key].to} onChange={(e) => set(s.key, "to", e.target.value)} className={selectClass}>
                  <option value="">{t("Nobody yet")}</option>
                  {tags.map((tg) => (
                    <option key={tg.id} value={tg.id}>
                      {tg.name}
                    </option>
                  ))}
                </select>
              </div>
              {s.hasCc && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("Copy in (tag)")}</label>
                  <select value={shown[s.key].cc} onChange={(e) => set(s.key, "cc", e.target.value)} className={selectClass}>
                    <option value="">{t("Nobody")}</option>
                    {tags.map((tg) => (
                      <option key={tg.id} value={tg.id}>
                        {tg.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* The names as SAVED; a change shows its names once saved. */}
            {!dirty && <AudienceLine p={{ to: v.to_names, cc: v.cc_names, withoutEmail: v.withoutEmail }} showCc={s.hasCc} />}
          </div>
        );
      })}

      <button
        onClick={save}
        disabled={saving || (!dirty && MINUTES_STAGES.every((st) => current[st.key].own))}
        className="bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
      >
        {saving ? t("Saving...") : t("Save for {name}", { name: typeName(type) })}
      </button>
    </div>
  );
}
