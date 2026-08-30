"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/useAuth";

export type ReminderRecipient =
  | "admin"
  | "applicant"
  | "submitter"
  | "custodian";
export type ReminderFrequency = "once" | "daily" | "weekly" | "monthly";

interface ExistingReminder {
  id: string;
  recipients: ReminderRecipient[];
  nextRunAt: string;
  frequency: ReminderFrequency;
  note: string;
  active: boolean;
  lastRunAt?: string;
  lastResult?: string;
}

const RECIPIENTS: { key: ReminderRecipient; label: string; hint: string }[] = [
  { key: "admin", label: "Admins", hint: "everyone who can manage spend" },
  { key: "applicant", label: "Applicant", hint: "who the request is for" },
  { key: "submitter", label: "Submitter", hint: "who captured it" },
  { key: "custodian", label: "Custodian", hint: "who is accountable" },
];

const FREQUENCIES: { key: ReminderFrequency; label: string }[] = [
  { key: "once", label: "Once only" },
  { key: "daily", label: "Every day" },
  { key: "weekly", label: "Every week" },
  { key: "monthly", label: "Every month" },
];

interface Props {
  spendId: string;
  projectName: string;
  onClose: () => void;
  onSaved: (message: string, ok: boolean) => void;
}

export default function ReminderModal({
  spendId,
  projectName,
  onClose,
  onSaved,
}: Props) {
  const [recipients, setRecipients] = useState<ReminderRecipient[]>([
    "custodian",
  ]);
  const [nextRunAt, setNextRunAt] = useState("");
  const [frequency, setFrequency] = useState<ReminderFrequency>("once");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [existing, setExisting] = useState<ExistingReminder[]>([]);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const loadExisting = async () => {
    const res = await authFetch(
      `/api/spend/reminders?spendId=${encodeURIComponent(spendId)}`
    );
    if (res.ok) setExisting(await res.json());
  };

  useEffect(() => {
    loadExisting();
    // Default to tomorrow - a reminder for today has already missed the run.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setNextRunAt(tomorrow.toISOString().slice(0, 10));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spendId]);

  const toggleRecipient = (key: ReminderRecipient) => {
    setRecipients((prev) =>
      prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]
    );
  };

  const save = async () => {
    setError("");
    if (recipients.length === 0) {
      setError("Choose at least one person to remind.");
      return;
    }
    if (!nextRunAt) {
      setError("Choose a reminder date.");
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch("/api/spend/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spendId,
          recipients,
          nextRunAt,
          frequency,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save the reminder");
      } else {
        onSaved("Reminder set", true);
        onClose();
      }
    } catch {
      setError("Could not save the reminder. Check your connection.");
    } finally {
      setSaving(false);
    }
  };

  const cancelReminder = async (id: string) => {
    const res = await authFetch(`/api/spend/reminders/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      loadExisting();
      onSaved("Reminder cancelled", true);
    } else {
      onSaved("Could not cancel that reminder", false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-dark">Set a reminder</h2>
          <p className="text-xs text-gray-500 mt-1">{projectName}</p>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Who should be reminded?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {RECIPIENTS.map((r) => (
                <label
                  key={r.key}
                  className="flex items-start gap-2 text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={recipients.includes(r.key)}
                    onChange={() => toggleRecipient(r.key)}
                    className="mt-0.5 accent-primary"
                  />
                  <span>
                    {r.label}
                    <span className="block text-xs text-gray-400">
                      {r.hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Addresses are worked out when the reminder is sent, so a change of
              custodian is picked up automatically.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reminder date
              </label>
              <input
                type="date"
                value={nextRunAt}
                min={today}
                onChange={(e) => setNextRunAt(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Repeat
              </label>
              <select
                value={frequency}
                onChange={(e) =>
                  setFrequency(e.target.value as ReminderFrequency)
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              >
                {FREQUENCIES.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. Please confirm the quote has been signed off."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
            />
          </div>

          {existing.length > 0 && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Reminders already set
              </p>
              <ul className="space-y-2">
                {existing.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-start justify-between gap-3 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2"
                  >
                    <span>
                      {r.active ? r.nextRunAt : "Finished"} &middot;{" "}
                      {FREQUENCIES.find((f) => f.key === r.frequency)?.label}
                      <span className="block text-gray-400">
                        {r.recipients
                          .map(
                            (x) =>
                              RECIPIENTS.find((rr) => rr.key === x)?.label || x
                          )
                          .join(", ")}
                      </span>
                      {r.lastResult && (
                        <span className="block text-gray-400">
                          Last run: {r.lastResult}
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => cancelReminder(r.id)}
                      className="text-risk-high hover:text-red-700 font-medium shrink-0"
                    >
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <p className="text-sm text-risk-high">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium"
          >
            Close
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="bg-primary hover:bg-primary-dark disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            {saving ? "Saving..." : "Set reminder"}
          </button>
        </div>
      </div>
    </div>
  );
}
