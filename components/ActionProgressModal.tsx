"use client";

import { useEffect, useState } from "react";
import { authFetch, apiErrorMessage } from "@/lib/useAuth";
import { STATUS_LABELS } from "@/lib/actionItems";
import type { ActionItem, ActionStatus } from "@/lib/actionItems";

const STATUSES = Object.keys(STATUS_LABELS) as ActionStatus[];

interface Props {
  item: ActionItem;
  onClose: () => void;
  onSaved: (message: string, saved: ActionItem) => void;
  onError: (message: string) => void;
}

// Reporting where an action has got to.
//
// Open to the people carrying it as well as to administrators: the person doing
// the work is the one who knows, and most governing-body members will never
// hold an admin permission. Every save writes a line in the log with a name on
// it, so a figure that moved can always be accounted for.
export default function ActionProgressModal({
  item,
  onClose,
  onSaved,
  onError,
}: Props) {
  const [progress, setProgress] = useState(item.progress);
  const [status, setStatus] = useState<ActionStatus>(item.status);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const save = async () => {
    setError("");
    setSaving(true);
    const res = await authFetch(`/api/action-items/${item.id}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progress, status, note }),
    });
    setSaving(false);

    if (!res.ok) {
      const message = await apiErrorMessage(res, "Could not save that update");
      setError(message);
      onError(message);
      return;
    }
    // The saved record, not a refetch. A read straight after a write can still
    // serve the previous copy of the blob, which shows the row unchanged and
    // makes a save that worked look like one that did not.
    onSaved(`${item.ref} updated`, await res.json());
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
          <h2 className="font-semibold text-dark">Update progress</h2>
          <p className="text-xs text-gray-500 mt-1">
            {item.ref} · {item.title}
          </p>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              How far along is it? {progress}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ActionStatus)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            {status === "done" && (
              <p className="text-xs text-gray-400 mt-1">
                Marking it done saves it at 100% and stops the reminders.
              </p>
            )}
            {status === "blocked" && (
              <p className="text-xs text-gray-400 mt-1">
                Say what it is waiting on in the note, so the next meeting can
                unblock it.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              What has happened since last time?
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="e.g. Two quotes received, third promised by Friday."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
            />
          </div>

          {item.updates.length > 0 && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Progress so far
              </p>
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {item.updates.map((u) => (
                  <li
                    key={u.id}
                    className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2"
                  >
                    <span className="block text-gray-500">
                      {new Date(u.at).toLocaleString()} · {u.byName} ·{" "}
                      {u.progress}% · {STATUS_LABELS[u.status]}
                    </span>
                    {u.note && <span className="block mt-1">{u.note}</span>}
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
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="bg-primary hover:bg-primary-dark disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            {saving ? "Saving..." : "Save update"}
          </button>
        </div>
      </div>
    </div>
  );
}
