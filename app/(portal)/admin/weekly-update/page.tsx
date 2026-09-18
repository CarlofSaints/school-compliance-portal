"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth, authFetch, apiErrorMessage } from "@/lib/useAuth";
import Toast from "@/components/Toast";
import { WEEKDAY_LABELS, type WeeklyFacts, type WeeklyUpdateSettings } from "@/lib/weeklyUpdate";

interface Recipient {
  id: string;
  name: string;
  email: string;
  notActivated: boolean;
  seesSpend: boolean;
}

interface Data {
  settings: WeeklyUpdateSettings;
  defaultTeamName: string;
  nextSendOn: string | null;
  emailConfigured: boolean;
  facts: WeeklyFacts;
  recipients: Recipient[];
  noEmail: string[];
}

function niceDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export default function WeeklyUpdatePage() {
  const { session, loading } = useAuth("manage_users");
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({ enabled: false, weekday: 1, teamName: "" });
  const [busy, setBusy] = useState<"" | "save" | "preview" | "previewNew" | "send">("");
  const [confirmSend, setConfirmSend] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    const res = await authFetch("/api/weekly-update", { cache: "no-store" });
    if (!res.ok) {
      const message = await apiErrorMessage(res, "Could not load the weekly update.");
      setLoadError(message);
      return;
    }
    const d: Data = await res.json();
    setData(d);
    setForm({ enabled: d.settings.enabled, weekday: d.settings.weekday, teamName: d.settings.teamName });
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  const save = async () => {
    setBusy("save");
    try {
      const res = await authFetch("/api/weekly-update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        setToast({ message: await apiErrorMessage(res, "Could not save."), type: "error" });
        return;
      }
      const saved = await res.json();
      // Spliced in from the response rather than refetched: a read straight
      // after a write can serve the previous copy.
      setData((d) => (d ? { ...d, settings: saved.settings, nextSendOn: saved.nextSendOn } : d));
      setToast({ message: "Saved", type: "success" });
    } finally {
      setBusy("");
    }
  };

  const post = async (kind: "preview" | "previewNew" | "send") => {
    setBusy(kind);
    try {
      const res = await authFetch("/api/weekly-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          kind === "send" ? { action: "send" } : { action: "preview", asNotActivated: kind === "previewNew" }
        ),
      });
      if (!res.ok) {
        setToast({ message: await apiErrorMessage(res, "Could not send."), type: "error" });
        return;
      }
      const r = await res.json();
      setToast({
        message: kind === "send" ? `Weekly update ${r.summary}` : `Preview sent to ${session?.email}`,
        type: r.failed ? "error" : "success",
      });
      if (kind === "send") await load();
    } finally {
      setBusy("");
      setConfirmSend(false);
    }
  };

  if (loading || !session) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const dirty =
    data &&
    (form.enabled !== data.settings.enabled ||
      form.weekday !== data.settings.weekday ||
      form.teamName !== data.settings.teamName);
  const notActivated = data?.recipients.filter((r) => r.notActivated) ?? [];

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Weekly SGB Update</h1>
        <p className="text-gray-500 mt-1">
          One email a week to every portal user, with open action items, spend awaiting approval, who has not signed in yet, and minutes
          still waiting for signatures. Sent in the school&apos;s own colours and crest.
        </p>
      </div>

      {loadError && <p className="text-red-600 mb-4">{loadError}</p>}
      {!data && !loadError && <p className="text-gray-500">Loading...</p>}

      {data && (
        <div className="space-y-6 max-w-3xl">
          {!data.emailConfigured && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4 text-sm">
              Email is not set up on this site (no RESEND_API_KEY), so nothing will actually be delivered.
            </div>
          )}

          {/* Schedule */}
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">Schedule</h2>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              />
              <span className="text-gray-800">Send the weekly update automatically</span>
            </label>

            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm text-gray-600">Send every</span>
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
              <label className="block">
                <span className="text-sm text-gray-600">Greeting: &quot;Good day, ___ team.&quot;</span>
                <input
                  className="mt-1 w-full border rounded-md px-3 py-2"
                  value={form.teamName}
                  placeholder={data.defaultTeamName}
                  maxLength={60}
                  onChange={(e) => setForm({ ...form, teamName: e.target.value })}
                />
              </label>
            </div>

            <p className="text-sm text-gray-500">
              {data.settings.enabled && data.nextSendOn
                ? `Next send: ${niceDate(data.nextSendOn)} at 07:00.`
                : "Off. Nothing is sent until you tick the box and save."}
              {data.settings.lastResult ? ` Last send: ${data.settings.lastResult}.` : ""}
            </p>

            <button
              onClick={save}
              disabled={!dirty || busy !== ""}
              className="bg-primary text-white px-4 py-2 rounded-md disabled:opacity-50"
            >
              {busy === "save" ? "Saving..." : "Save schedule"}
            </button>
          </div>

          {/* What this week's email says */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">If it went out now</h2>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Stat value={data.facts.actions.open} label="Open action items" sub={`${data.facts.actions.overdue} overdue`} />
              <Stat
                value={data.facts.accounts.notActivated}
                label="Not yet signed in"
                sub={`of ${data.facts.accounts.total} users`}
              />
              <Stat value={data.facts.minutes.length} label="Minutes to sign" sub="awaiting signatures" />
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Stat value={data.facts.spend.awaiting} label="Awaiting approval" sub="spend projects" />
              <Stat value={data.facts.spend.approved} label="Approved" sub="in progress" />
              <Stat value={data.facts.spend.changes} label="Sent back" sub={`${data.facts.spend.completed} completed`} />
            </div>
            <p className="text-xs text-gray-500 mb-3">
              The spend row only goes to people whose role can see all spend applications
              ({data.recipients.filter((r) => r.seesSpend).length} of {data.recipients.length}).
            </p>
            {data.facts.minutes.map((m) => (
              <p key={m.title + m.period} className="text-sm text-gray-700">
                <strong>{m.title}</strong> ({m.period}): waiting on {m.waitingOn.join(", ") || "nobody"}
              </p>
            ))}

            <div className="flex flex-wrap gap-3 mt-5">
              <button
                onClick={() => post("preview")}
                disabled={busy !== ""}
                className="border border-primary text-primary px-4 py-2 rounded-md disabled:opacity-50"
              >
                {busy === "preview" ? "Sending..." : "Email a preview to me"}
              </button>
              <button
                onClick={() => post("previewNew")}
                disabled={busy !== ""}
                className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md disabled:opacity-50"
                title="The copy a user who has not signed in yet receives"
              >
                {busy === "previewNew" ? "Sending..." : "Preview the not-signed-in version"}
              </button>
              {!confirmSend ? (
                <button
                  onClick={() => setConfirmSend(true)}
                  disabled={busy !== ""}
                  className="bg-gray-800 text-white px-4 py-2 rounded-md disabled:opacity-50"
                >
                  Send to everyone now
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

          {/* Recipients */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Who receives it ({data.recipients.length})</h2>
            <p className="text-sm text-gray-500 mb-4">
              Every portal user, including the {notActivated.length} who have not signed in yet. Their copy adds a
              &quot;Set my password&quot; link so they can finish setting up.
            </p>
            <ul className="divide-y text-sm">
              {data.recipients.map((r) => (
                <li key={r.id} className="py-2 flex justify-between gap-4">
                  <span className="text-gray-800">
                    {r.name || "(no name)"} <span className="text-gray-500">{r.email}</span>
                  </span>
                  {r.seesSpend && <span className="text-xs text-gray-500 whitespace-nowrap">sees spend</span>}
                  {r.notActivated ? (
                    <span className="text-amber-700 whitespace-nowrap">Not signed in yet</span>
                  ) : (
                    <span className="text-green-700 whitespace-nowrap">Active</span>
                  )}
                </li>
              ))}
            </ul>
            {data.noEmail.length > 0 && (
              <p className="text-sm text-red-600 mt-3">
                No usable email address, so left out: {data.noEmail.join(", ")}. Fix it on the Users page.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ value, label, sub }: { value: number; label: string; sub: string }) {
  return (
    <div className="border rounded-lg p-4 text-center bg-gray-50">
      <div className="text-3xl font-bold text-primary">{value}</div>
      <div className="text-sm font-medium text-gray-800 mt-1">{label}</div>
      <div className="text-xs text-gray-500">{sub}</div>
    </div>
  );
}
