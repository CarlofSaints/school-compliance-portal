"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { authFetch, apiErrorMessage } from "@/lib/useAuth";
import { ACCESS_BODIES, ACCESS_BODY_LABELS, type BodyAccess } from "@/lib/minutesAccessRules";
import type { MeetingBody } from "@/lib/minutes";

// Who may READ each category of minutes. Set per category, never per set of
// minutes (Carl: "per category, not every set of minutes, that would be
// cumbersome"). The rule and its defaults are in lib/minutesAccessRules.ts.
//
// Every card shows the actual NAMES the setting lets in, the same as the
// recipients tab: a tag nobody has looked at is how the wrong people end up
// reading FINCOM minutes, or the right ones stop.

interface Shown extends BodyAccess {
  isDefault: boolean;
  readers: string[];
}

const DEFAULT_NOTE: Record<MeetingBody, string> = {
  sgb: "Everyone signed in, until you choose otherwise.",
  fincom: "The people on the FINCOM minutes list (Who receives minutes), until you choose otherwise.",
  other: "Everyone signed in, until you choose otherwise.",
};

export default function MinutesAccessSettings({
  onSaved,
  onError,
}: {
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const [access, setAccess] = useState<Partial<Record<MeetingBody, Shown>>>({});
  const [draft, setDraft] = useState<Partial<Record<MeetingBody, BodyAccess>>>({});
  // Only bodies somebody changed are saved; "default" puts one back on its
  // default. Sending all three would freeze FINCOM's default (its distribution
  // list) into a fixed copy the first time anyone changed SGB.
  const [touched, setTouched] = useState<Partial<Record<MeetingBody, "set" | "default">>>({});
  const [busy, setBusy] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  // The parent passes a new onError on every render. Held in a ref so the
  // loader does not change identity each render, which would re-run the effect
  // below and fetch in an endless loop.
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });

  // busy starts true, so the first load needs no synchronous setState.
  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/minutes-access", { cache: "no-store" });
      if (!res.ok) {
        // A failed load must never leave a form that saves defaults over the
        // school's real settings.
        setLoadFailed(true);
        onErrorRef.current(await apiErrorMessage(res, "Could not load who can read minutes."));
        return;
      }
      const data = await res.json();
      setTags(data.tags || []);
      setAccess(data.access || {});
      setDraft(
        Object.fromEntries(
          ACCESS_BODIES.map((b) => [b, { mode: data.access?.[b]?.mode ?? "everyone", tagIds: data.access?.[b]?.tagIds ?? [] }])
        )
      );
      setTouched({});
      setLoadFailed(false);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (body: MeetingBody, next: Partial<BodyAccess>) => {
    setDraft((d) => ({ ...d, [body]: { mode: "everyone", tagIds: [], ...d[body], ...next } }));
    setTouched((t) => ({ ...t, [body]: "set" }));
  };

  const backToDefault = (body: MeetingBody) => setTouched((t) => ({ ...t, [body]: "default" }));

  const toggleTag = (body: MeetingBody, tagId: string) => {
    const current = draft[body]?.tagIds ?? [];
    set(body, { tagIds: current.includes(tagId) ? current.filter((t) => t !== tagId) : [...current, tagId] });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await authFetch("/api/minutes-access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          Object.fromEntries(
            Object.entries(touched).map(([b, how]) => [
              b,
              how === "default" ? { mode: "default" } : draft[b as MeetingBody],
            ])
          )
        ),
      });
      if (!res.ok) {
        onError(await apiErrorMessage(res, "Could not save."));
        return;
      }
      onSaved("Saved who can read minutes.");
      load();
    } finally {
      setSaving(false);
    }
  };

  if (busy) return <div className="p-6 text-gray-400 text-sm">Loading...</div>;
  if (loadFailed) {
    return (
      <div className="p-6 text-sm text-red-600">
        Could not load the current settings, so nothing can be changed here right now. Refresh to try again.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Choose who can read each kind of minutes. Minutes admins can always read everything, and
        anyone asked to check or sign a set of minutes can always read that set.
      </p>

      {ACCESS_BODIES.map((body) => {
        const d = draft[body] ?? { mode: "everyone", tagIds: [] };
        const shown = access[body];
        const noTags = d.mode === "tags" && d.tagIds.length === 0;
        return (
          <div key={body} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold text-dark">{ACCESS_BODY_LABELS[body]}</h3>
              {touched[body] === "default" ? (
                <span className="text-xs text-amber-700">Goes back to the default when you save.</span>
              ) : shown?.isDefault && !touched[body] ? (
                <span className="text-xs text-gray-400">Default: {DEFAULT_NOTE[body]}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => backToDefault(body)}
                  className="text-xs text-primary hover:text-primary-dark"
                >
                  Use the default instead
                </button>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {([
                ["everyone", "Everyone signed in"],
                ["tags", "Only people with these tags"],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => set(body, { mode })}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    d.mode === mode
                      ? "bg-primary text-white border-primary"
                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {d.mode === "tags" && (
              <div className="mt-3">
                {tags.length === 0 ? (
                  <p className="text-sm text-amber-700">No tags yet. Create them under Admin, Tags.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((t) => (
                      <label
                        key={t.id}
                        className={`cursor-pointer select-none px-3 py-1.5 rounded-full text-sm border ${
                          d.tagIds.includes(t.id)
                            ? "bg-primary/10 border-primary text-dark"
                            : "bg-white border-gray-200 text-gray-600"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mr-1.5 align-middle"
                          checked={d.tagIds.includes(t.id)}
                          onChange={() => toggleTag(body, t.id)}
                        />
                        {t.name}
                      </label>
                    ))}
                  </div>
                )}
                {noTags && (
                  <p className="mt-2 text-sm text-amber-700">
                    No tags chosen, so only minutes admins (and anyone asked to check or sign a set)
                    can read these.
                  </p>
                )}
              </div>
            )}

            {shown && shown.mode === "tags" && (
              <p className="mt-3 text-xs text-gray-500">
                Saved setting lets in:{" "}
                {shown.readers.length ? shown.readers.join(", ") : <em>nobody beyond minutes admins</em>}
              </p>
            )}
          </div>
        );
      })}

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving || Object.keys(touched).length === 0}
          className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? "Saving..." : "Save who can read minutes"}
        </button>
      </div>
    </div>
  );
}
