"use client";

import { useState } from "react";
import { authFetch, apiErrorMessage } from "@/lib/useAuth";
import {
  ACTION_CATEGORIES,
  ALL_RECIPIENTS,
  DEFAULT_REMINDER,
  PRIORITY_LABELS,
  RECIPIENT_LABELS,
  STATUS_LABELS,
  todayIso,
} from "@/lib/actionItems";
import type {
  ActionItem,
  ActionPriority,
  ActionRecipient,
  ActionStatus,
} from "@/lib/actionItems";

interface DirectoryPerson {
  id: string;
  position: string;
  name: string;
  email: string;
  hasLogin: boolean;
}

interface Props {
  directory: DirectoryPerson[];
  // null when raising a new action.
  existing: ActionItem | null;
  onCancel: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

const STATUSES = Object.keys(STATUS_LABELS) as ActionStatus[];
const PRIORITIES = Object.keys(PRIORITY_LABELS) as ActionPriority[];

const labelClass = "block text-sm font-medium text-gray-700 mb-1";
const fieldClass =
  "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none";

// Raising and editing an action.
//
// The parent gives this a key of the action's id, so switching from one row's
// Edit to another remounts it. Without that the fields keep the first row's
// values and the save writes them over the second action.
export default function ActionItemForm({
  directory,
  existing,
  onCancel,
  onSaved,
  onError,
}: Props) {
  const [title, setTitle] = useState(existing?.title || "");
  const [description, setDescription] = useState(existing?.description || "");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    existing?.assigneeIds || []
  );
  const [category, setCategory] = useState(existing?.category || "Governance");
  const [priority, setPriority] = useState<ActionPriority>(
    existing?.priority || "medium"
  );
  // A fortnight out is the common case for an SGB action, and a date already in
  // the box is one less thing between somebody and a saved action.
  const [dueDate, setDueDate] = useState(
    existing?.dueDate ||
      new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  );
  const [meetingDate, setMeetingDate] = useState(existing?.meetingDate || "");
  const [status, setStatus] = useState<ActionStatus>(
    existing?.status || "not_started"
  );
  const [progress, setProgress] = useState(existing?.progress ?? 0);

  const reminder = existing?.reminder || DEFAULT_REMINDER;
  const [remindOn, setRemindOn] = useState(reminder.enabled);
  const [daysBefore, setDaysBefore] = useState(String(reminder.daysBefore));
  const [repeatEvery, setRepeatEvery] = useState(
    String(reminder.repeatEveryDays)
  );
  const [recipients, setRecipients] = useState<ActionRecipient[]>(
    reminder.recipients
  );
  const [notify, setNotify] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // A stored category that is no longer on the list must still appear, or the
  // select would silently show the first option and the save would change it.
  const categoryOptions = ACTION_CATEGORIES.includes(category)
    ? ACTION_CATEGORIES
    : [...ACTION_CATEGORIES, category];

  const toggleAssignee = (id: string) => {
    setAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleRecipient = (key: ActionRecipient) => {
    setRecipients((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
    );
  };

  const save = async () => {
    setError("");
    if (!title.trim()) {
      setError("Give the action a name.");
      return;
    }
    if (remindOn && recipients.length === 0) {
      setError("Choose at least one person for the reminders to go to.");
      return;
    }

    setSaving(true);
    const payload = {
      title: title.trim(),
      description: description.trim(),
      assigneeIds,
      category,
      priority,
      dueDate,
      meetingDate,
      status,
      progress: Number(progress),
      notify,
      reminder: {
        enabled: remindOn,
        daysBefore: Number(daysBefore),
        repeatEveryDays: Number(repeatEvery),
        recipients,
      },
    };

    const res = existing
      ? await authFetch(`/api/action-items/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await authFetch("/api/action-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    setSaving(false);

    if (!res.ok) {
      const message = await apiErrorMessage(res, "Could not save that action");
      setError(message);
      onError(message);
      return;
    }

    const saved = await res.json();
    const emailed = saved.notified
      ? `, ${saved.notified} notified by email`
      : "";
    onSaved(
      existing
        ? `${saved.ref} saved${emailed}`
        : `${saved.ref} raised${emailed}`
    );
  };

  // Grouped so a long register reads as the governing body rather than as a
  // flat list of names.
  const byPosition = [...directory].sort((a, b) =>
    a.position.localeCompare(b.position)
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
      <h2 className="font-semibold text-dark mb-4">
        {existing ? `Edit ${existing.ref}` : "Raise an action"}
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className={labelClass}>What has to be done</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="e.g. Obtain three quotes for the hall roof"
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>Detail</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="What good looks like, and anything the person needs to know to start."
              className={`${fieldClass} resize-y`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={fieldClass}
              >
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Priority</label>
              <select
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as ActionPriority)
                }
                className={fieldClass}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>ETA</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={fieldClass}
              />
              <p className="text-xs text-gray-400 mt-1">
                An action with no ETA is never chased.
              </p>
            </div>
            <div>
              <label className={labelClass}>Agreed at the meeting of</label>
              <input
                type="date"
                value={meetingDate}
                max={todayIso()}
                onChange={(e) => setMeetingDate(e.target.value)}
                className={fieldClass}
              />
              <p className="text-xs text-gray-400 mt-1">Optional.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ActionStatus)}
                className={fieldClass}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Progress: {progress}%</label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="w-full accent-primary mt-3"
              />
              {status === "done" && (
                <p className="text-xs text-gray-400 mt-1">
                  A done action is saved at 100%.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>Assigned to</label>
            {byPosition.length === 0 ? (
              <p className="text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-2">
                Nobody is on the register yet. Add people under Admin, People
                and Positions first.
              </p>
            ) : (
              <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-gray-50">
                {byPosition.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-start gap-2 px-3 py-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={assigneeIds.includes(p.id)}
                      onChange={() => toggleAssignee(p.id)}
                      className="mt-1 accent-primary"
                    />
                    <span>
                      {p.name || p.position}
                      <span className="block text-xs text-gray-400">
                        {p.position}
                        {p.email ? ` · ${p.email}` : " · no email on file"}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Somebody with no email on file can still carry an action, they
              just cannot be reminded.
            </p>
          </div>

          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={remindOn}
                onChange={(e) => setRemindOn(e.target.checked)}
                className="accent-primary"
              />
              Chase this action by email
            </label>

            {remindOn && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Days before the ETA</label>
                    <input
                      type="number"
                      min={0}
                      max={60}
                      value={daysBefore}
                      onChange={(e) => setDaysBefore(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      Then every N days while late
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={90}
                      value={repeatEvery}
                      onChange={(e) => setRepeatEvery(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                </div>
                <div>
                  <p className={labelClass}>Reminders go to</p>
                  <div className="space-y-1">
                    {ALL_RECIPIENTS.map((r) => (
                      <label
                        key={r}
                        className="flex items-center gap-2 text-sm text-gray-700"
                      >
                        <input
                          type="checkbox"
                          checked={recipients.includes(r)}
                          onChange={() => toggleRecipient(r)}
                          className="accent-primary"
                        />
                        {RECIPIENT_LABELS[r]}
                      </label>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  A heads-up before the ETA, a nudge on the day, then a chase on
                  that cycle until it is done. Set the repeat to 0 to stop after
                  the day itself. Addresses are worked out when the reminder is
                  sent, so a change of assignee is picked up automatically.
                </p>
              </>
            )}
          </div>

          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              className="mt-1 accent-primary"
            />
            <span>
              Email the people assigned now
              <span className="block text-xs text-gray-400">
                {existing
                  ? "Only anybody newly added to this action."
                  : "So the first they hear of it is not a chase."}
              </span>
            </span>
          </label>
        </div>
      </div>

      {error && <p className="text-sm text-risk-high mt-4">{error}</p>}

      <div className="flex gap-3 mt-6">
        <button
          onClick={save}
          disabled={saving}
          className="bg-primary hover:bg-primary-dark disabled:bg-gray-300 text-white px-6 py-2 rounded-lg text-sm font-medium"
        >
          {saving ? "Saving..." : existing ? "Save changes" : "Raise the action"}
        </button>
        <button
          onClick={onCancel}
          className="px-6 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
