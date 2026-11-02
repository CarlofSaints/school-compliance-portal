"use client";

import { useEffect, useState } from "react";
import { authFetch, apiErrorMessage } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";
import { isBuiltInMeetingType, MAX_MEETING_TYPE_LABEL } from "@/lib/meetingTypes";

// Admin, Minutes Admin, Meeting types. Carl: "a place to create and edit
// meeting types", e.g. add AGM, or rename "SGB / Board" to "SGB".
// The rules (built-ins never removed, a type in use never removed) are on the
// server in lib/meetingTypesData.ts; this screen only says them up front.

interface Row {
  id: string;
  label: string;
  minutes: number;
  templates: number;
}

export default function MeetingTypesSettings({
  onSaved,
  onError,
}: {
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const t = useT();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);

  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let live = true;
    authFetch("/api/meeting-types?usage=1", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(await apiErrorMessage(res, t("Could not load the meeting types.")));
        return res.json();
      })
      .then((data: { types: Row[] }) => {
        if (!live) return;
        setRows(data.types);
        setNames(Object.fromEntries(data.types.map((r) => [r.id, r.label])));
      })
      .catch((e: Error) => live && setLoadError(e.message));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(payload: Record<string, string>, ok: string) {
    setBusy(true);
    try {
      const res = await authFetch("/api/meeting-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        onError(await apiErrorMessage(res, t("That did not work.")));
        return false;
      }
      // 🔴 The list from the reply, never a re-read: a read straight after the
      // write can still serve the old copy, so the new type would seem lost.
      const { types } = (await res.json()) as { types: { id: string; label: string }[] };
      setRows((old) =>
        types.map((ty) => {
          const was = old?.find((o) => o.id === ty.id);
          return { ...ty, minutes: was?.minutes ?? 0, templates: was?.templates ?? 0 };
        })
      );
      setNames(Object.fromEntries(types.map((ty) => [ty.id, ty.label])));
      onSaved(ok);
      return true;
    } catch {
      onError(t("That did not work."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  // A failed load shows no form: saving over a list that never arrived would be blind.
  if (loadError) return <div className="p-6 text-sm text-red-600">{loadError}</div>;
  if (!rows) return <div className="p-6 text-gray-400 text-sm">{t("Loading...")}</div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        {t("The meetings you keep minutes for. Rename any of them. Types you add can be removed while no minutes or templates use them. Signed minutes of every type except FINCOM go to the SGB / Board list under Who receives minutes.")}
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
        {rows.map((r) => {
          const changed = (names[r.id] ?? "").trim() !== r.label;
          const inUse = r.minutes + r.templates > 0;
          const builtIn = isBuiltInMeetingType(r.id);
          return (
            <div key={r.id} className="p-4 flex flex-wrap items-center gap-3">
              <input
                value={names[r.id] ?? ""}
                maxLength={MAX_MEETING_TYPE_LABEL}
                aria-label={t("Name of the meeting type")}
                onChange={(e) => setNames((n) => ({ ...n, [r.id]: e.target.value }))}
                className="flex-1 min-w-[12rem] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
              <span className="text-xs text-gray-400">
                {t("{m} minutes, {n} templates", { m: r.minutes, n: r.templates })}
              </span>
              {changed && (
                <button
                  disabled={busy}
                  onClick={() => act({ action: "rename", id: r.id, label: names[r.id] }, t("Renamed."))}
                  className="bg-primary hover:bg-primary-dark text-white px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {t("Save name")}
                </button>
              )}
              {builtIn ? (
                <span className="text-xs text-gray-400">{t("Built in, cannot be removed")}</span>
              ) : (
                <button
                  disabled={busy || inUse}
                  title={inUse ? t("Still used by minutes or templates. Move those to another type first.") : undefined}
                  onClick={() => act({ action: "remove", id: r.id }, t("Removed."))}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm disabled:opacity-40"
                >
                  {t("Remove")}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act({ action: "add", label: adding }, t("Added \"{name}\".", { name: adding.trim() }))) setAdding("");
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          value={adding}
          maxLength={MAX_MEETING_TYPE_LABEL}
          onChange={(e) => setAdding(e.target.value)}
          placeholder={t("New meeting type, e.g. AGM")}
          className="flex-1 min-w-[12rem] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
        />
        <button
          type="submit"
          disabled={busy || !adding.trim()}
          className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {t("Add meeting type")}
        </button>
      </form>
    </div>
  );
}
