"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth, authFetch, apiErrorMessage } from "@/lib/useAuth";
import { downloadWithAuth } from "@/lib/download";
import Toast from "@/components/Toast";
import { WEEKDAY_LABELS } from "@/lib/weeklyUpdate";
import {
  ALL_FREQUENCIES,
  FREQUENCY_LABELS,
  ordinal,
  type ActionSummarySettings,
  type SummaryCounts,
  type SummaryFrequency,
} from "@/lib/actionSummary";

const ADMIN_PERMISSIONS = ["manage_action_items", "manage_people"];

interface Recipient {
  email: string;
  name: string;
  via: string;
}

interface Data {
  settings: ActionSummarySettings;
  nextSendOn: string | null;
  scheduleText: string;
  emailConfigured: boolean;
  counts: SummaryCounts;
  users: { id: string; name: string; email: string }[];
  tags: { id: string; name: string; members: number }[];
  recipients: Recipient[];
  problems: string[];
}

interface Form {
  enabled: boolean;
  frequency: SummaryFrequency;
  weekday: number;
  dayOfMonth: number;
  dueSoonDays: number;
  userIds: string[];
  tagIds: string[];
  extraEmailsText: string;
}

function formFrom(s: ActionSummarySettings): Form {
  return {
    enabled: s.enabled,
    frequency: s.frequency,
    weekday: s.weekday,
    dayOfMonth: s.dayOfMonth,
    dueSoonDays: s.dueSoonDays,
    userIds: s.userIds,
    tagIds: s.tagIds,
    extraEmailsText: s.extraEmails.join("\n"),
  };
}

const emailsFrom = (text: string) =>
  [...new Set(text.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];

function niceDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

const toggle = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

export default function ActionSummaryPage() {
  const { session, loading } = useAuth(ADMIN_PERMISSIONS);
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "preview" | "send" | "download">("");
  const [confirmSend, setConfirmSend] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    const res = await authFetch("/api/action-summary", { cache: "no-store" });
    if (!res.ok) {
      setLoadError(await apiErrorMessage(res, "Could not load the action summary settings."));
      return;
    }
    const d: Data = await res.json();
    setData(d);
    setForm(formFrom(d.settings));
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  const dirty = useMemo(() => {
    if (!data || !form) return false;
    const saved = formFrom(data.settings);
    return (
      form.enabled !== saved.enabled ||
      form.frequency !== saved.frequency ||
      form.weekday !== saved.weekday ||
      form.dayOfMonth !== saved.dayOfMonth ||
      form.dueSoonDays !== saved.dueSoonDays ||
      [...form.userIds].sort().join() !== [...saved.userIds].sort().join() ||
      [...form.tagIds].sort().join() !== [...saved.tagIds].sort().join() ||
      emailsFrom(form.extraEmailsText).join() !== emailsFrom(saved.extraEmailsText).join()
    );
  }, [data, form]);

  const save = async () => {
    if (!form) return;
    setBusy("save");
    try {
      const res = await authFetch("/api/action-summary", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: form.enabled,
          frequency: form.frequency,
          weekday: form.weekday,
          dayOfMonth: form.dayOfMonth,
          dueSoonDays: form.dueSoonDays,
          userIds: form.userIds,
          tagIds: form.tagIds,
          extraEmails: emailsFrom(form.extraEmailsText),
        }),
      });
      if (!res.ok) {
        setToast({ message: await apiErrorMessage(res, "Could not save."), type: "error" });
        return;
      }
      const saved = await res.json();
      // Spliced in from the response rather than refetched: a read straight
      // after a write can serve the previous copy.
      setData((d) => (d ? { ...d, ...saved } : d));
      setForm(formFrom(saved.settings));
      setToast({ message: "Saved", type: "success" });
    } finally {
      setBusy("");
    }
  };

  const post = async (kind: "preview" | "send") => {
    setBusy(kind);
    try {
      const res = await authFetch("/api/action-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: kind }),
      });
      if (!res.ok) {
        setToast({ message: await apiErrorMessage(res, "Could not send."), type: "error" });
        return;
      }
      const r = await res.json();
      setToast({
        message: kind === "send" ? `Summary ${r.summary}` : `Preview sent to ${session?.email}`,
        type: r.failed ? "error" : "success",
      });
      if (kind === "send") await load();
    } finally {
      setBusy("");
      setConfirmSend(false);
    }
  };

  const download = async () => {
    setBusy("download");
    const result = await downloadWithAuth("/api/action-summary?download=1", "action-items.xlsx");
    setBusy("");
    if (!result.ok) setToast({ message: result.error || "Could not download the file.", type: "error" });
  };

  if (loading || !session) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const shownUsers =
    data?.users.filter((u) => {
      const q = userSearch.trim().toLowerCase();
      return !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    }) ?? [];

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Action Summary Email</h1>
        <p className="text-gray-500 mt-1">
          An email with every open action item attached as a colour-coded Excel file: person responsible, ETA, progress and the
          latest update. Red is overdue, orange is due soon. You choose how often it goes and who gets it.
        </p>
      </div>

      {loadError && <p className="text-red-600 mb-4">{loadError}</p>}
      {!data && !loadError && <p className="text-gray-500">Loading...</p>}

      {data && form && (
        <div className="space-y-6 max-w-3xl">
          {!data.emailConfigured && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4 text-sm">
              Email is not set up on this site (no RESEND_API_KEY), so nothing will actually be delivered.
            </div>
          )}

          {/* What it would send now */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">If it went out now</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <Stat value={data.counts.open} label="Open" tone="primary" />
              <Stat value={data.counts.overdue} label="Overdue" tone={data.counts.overdue ? "red" : "grey"} />
              <Stat value={data.counts.dueSoon} label={`Due in ${data.settings.dueSoonDays} days`} tone={data.counts.dueSoon ? "orange" : "grey"} />
              <Stat value={data.counts.noDate} label="No ETA set" tone="grey" />
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={download}
                disabled={busy !== ""}
                className="bg-primary text-white px-4 py-2 rounded-md disabled:opacity-50"
              >
                {busy === "download" ? "Building..." : "Download the Excel now"}
              </button>
              <button
                onClick={() => post("preview")}
                disabled={busy !== ""}
                className="border border-primary text-primary px-4 py-2 rounded-md disabled:opacity-50"
              >
                {busy === "preview" ? "Sending..." : "Email a preview to me"}
              </button>
              {!confirmSend ? (
                <button
                  onClick={() => setConfirmSend(true)}
                  disabled={busy !== "" || data.recipients.length === 0 || dirty}
                  title={dirty ? "Save your changes first" : data.recipients.length === 0 ? "Nobody is on the list yet" : ""}
                  className="bg-gray-800 text-white px-4 py-2 rounded-md disabled:opacity-50"
                >
                  Send to the list now
                </button>
              ) : (
                <span className="flex items-center gap-2">
                  <button
                    onClick={() => post("send")}
                    disabled={busy !== ""}
                    className="bg-red-600 text-white px-4 py-2 rounded-md disabled:opacity-50"
                  >
                    {busy === "send" ? "Sending..." : `Yes, email all ${data.recipients.length}`}
                  </button>
                  <button onClick={() => setConfirmSend(false)} className="text-gray-600 px-2">
                    Cancel
                  </button>
                </span>
              )}
            </div>
          </div>

          {/* Schedule */}
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">How often</h2>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              />
              <span className="text-gray-800">Send the summary automatically</span>
            </label>

            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm text-gray-600">Send</span>
                <select
                  className="mt-1 w-full border rounded-md px-3 py-2"
                  value={form.frequency}
                  onChange={(e) => setForm({ ...form, frequency: e.target.value as SummaryFrequency })}
                >
                  {ALL_FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {FREQUENCY_LABELS[f]}
                    </option>
                  ))}
                </select>
              </label>

              {(form.frequency === "weekly" || form.frequency === "fortnightly") && (
                <label className="block">
                  <span className="text-sm text-gray-600">On</span>
                  <select
                    className="mt-1 w-full border rounded-md px-3 py-2"
                    value={form.weekday}
                    onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}
                  >
                    {WEEKDAY_LABELS.map((d, i) => (
                      <option key={d} value={i}>
                        {d} at 07:00
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {form.frequency === "monthly" && (
                <label className="block">
                  <span className="text-sm text-gray-600">On the</span>
                  <select
                    className="mt-1 w-full border rounded-md px-3 py-2"
                    value={form.dayOfMonth}
                    onChange={(e) => setForm({ ...form, dayOfMonth: Number(e.target.value) })}
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {ordinal(d)} of the month at 07:00
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="text-sm text-gray-600">Orange (&quot;due soon&quot;) when the ETA is within</span>
                <select
                  className="mt-1 w-full border rounded-md px-3 py-2"
                  value={form.dueSoonDays}
                  onChange={(e) => setForm({ ...form, dueSoonDays: Number(e.target.value) })}
                >
                  {[3, 5, 7, 10, 14, 21, 30].map((d) => (
                    <option key={d} value={d}>
                      {d} days
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="text-sm text-gray-500">
              {data.settings.enabled && data.nextSendOn
                ? `${data.scheduleText}. Next send: ${niceDate(data.nextSendOn)}.`
                : "Off. Nothing is sent until you tick the box and save."}
              {data.settings.lastResult ? ` Last send: ${data.settings.lastResult}.` : ""}
            </p>
          </div>

          {/* Who */}
          <div className="bg-white rounded-lg shadow p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Who gets it</h2>
              <p className="text-sm text-gray-500 mt-1">
                Pick people, tags, or type addresses. A tag is looked up on every send, so somebody newly tagged is on the next
                one. Nobody picked means nobody is emailed.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Tags</h3>
              {data.tags.length === 0 ? (
                <p className="text-sm text-gray-500">No tags yet. Create them in Admin, Tags.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.tags.map((t) => {
                    const on = form.tagIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setForm({ ...form, tagIds: toggle(form.tagIds, t.id) })}
                        className={`px-3 py-1.5 rounded-full text-sm border ${
                          on ? "bg-primary text-white border-primary" : "bg-white text-gray-700 border-gray-300"
                        }`}
                      >
                        {on ? "✓ " : ""}
                        {t.name} <span className={on ? "text-white/80" : "text-gray-400"}>({t.members})</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                People ({form.userIds.length} picked)
              </h3>
              <input
                className="w-full border rounded-md px-3 py-2 mb-2 text-sm"
                placeholder="Search by name or email"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
              <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
                {shownUsers.map((u) => (
                  <label key={u.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={form.userIds.includes(u.id)}
                      onChange={() => setForm({ ...form, userIds: toggle(form.userIds, u.id) })}
                    />
                    <span className="text-gray-800">{u.name || "(no name)"}</span>
                    <span className="text-gray-500 truncate">{u.email || "no email address"}</span>
                  </label>
                ))}
                {shownUsers.length === 0 && <p className="px-3 py-2 text-sm text-gray-500">Nobody matches.</p>}
              </div>
            </div>

            <label className="block">
              <span className="text-sm font-semibold text-gray-700">Other addresses (one per line)</span>
              <textarea
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                rows={3}
                placeholder="chair@example.co.za"
                value={form.extraEmailsText}
                onChange={(e) => setForm({ ...form, extraEmailsText: e.target.value })}
              />
              <span className="text-xs text-gray-500">
                For people with no portal account. They receive the full list, so add only people who should see it.
              </span>
            </label>

            <button
              onClick={save}
              disabled={!dirty || busy !== ""}
              className="bg-primary text-white px-4 py-2 rounded-md disabled:opacity-50"
            >
              {busy === "save" ? "Saving..." : "Save"}
            </button>
            {dirty && <span className="ml-3 text-sm text-amber-700">Unsaved changes</span>}

            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                As saved, it goes to {data.recipients.length} {data.recipients.length === 1 ? "address" : "addresses"}
              </h3>
              {data.recipients.length > 0 && (
                <ul className="divide-y text-sm">
                  {data.recipients.map((r) => (
                    <li key={r.email} className="py-2 flex justify-between gap-4">
                      <span className="text-gray-800">
                        {r.name} <span className="text-gray-500">{r.email !== r.name ? r.email : ""}</span>
                      </span>
                      <span className="text-xs text-gray-500 whitespace-nowrap">{r.via}</span>
                    </li>
                  ))}
                </ul>
              )}
              {data.problems.length > 0 && (
                <ul className="text-sm text-red-600 mt-2 space-y-1">
                  {data.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone: "primary" | "red" | "orange" | "grey" }) {
  const colour = {
    primary: "text-primary",
    red: "text-red-600",
    orange: "text-orange-500",
    grey: "text-gray-400",
  }[tone];
  return (
    <div className="border rounded-lg p-4 text-center bg-gray-50">
      <div className={`text-3xl font-bold ${colour}`}>{value}</div>
      <div className="text-sm font-medium text-gray-800 mt-1">{label}</div>
    </div>
  );
}
