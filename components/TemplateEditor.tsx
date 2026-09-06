"use client";

import { useState } from "react";
import {
  MEETING_BODY_LABELS,
  type MeetingBody,
  type MinutesTemplate,
  type TemplateSection,
} from "@/lib/minutes";

// Building a minutes template: name it, add sections, optionally link people to
// a section and optionally give it wording that carries over between meetings.
//
// 🔴 Declared at MODULE level. A component declared inside another is a new
// type on every render, so React remounts it and every keystroke loses focus in
// the textarea being typed into.

interface PersonRow {
  id: string;
  name: string;
  surname?: string;
  position?: string;
}

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());
}

const inputClass =
  "w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition";

export default function TemplateEditor({
  template,
  people,
  onChange,
  onSave,
  onCancel,
  onDelete,
}: {
  template: MinutesTemplate;
  people: PersonRow[];
  onChange: (t: MinutesTemplate) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const sections = [...template.sections].sort((a, b) => a.order - b.order);

  // Order is rewritten from array position every time, so it is always 1..n.
  const commit = (next: TemplateSection[]) =>
    onChange({ ...template, sections: next.map((s, i) => ({ ...s, order: i + 1 })) });

  const update = (id: string, patch: Partial<TemplateSection>) =>
    commit(sections.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const move = (id: string, dir: -1 | 1) => {
    const i = sections.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };

  const problem =
    !template.name.trim()
      ? "Give the template a name."
      : sections.length === 0
        ? "Add at least one section."
        : sections.some((s) => !s.title.trim())
          ? "Every section needs a heading."
          : null;

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Template name
            </label>
            <input
              value={template.name}
              onChange={(e) => onChange({ ...template, name: e.target.value })}
              placeholder="e.g. SGB monthly meeting"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              For which meeting
            </label>
            <select
              value={template.body ?? ""}
              onChange={(e) =>
                onChange({
                  ...template,
                  body: (e.target.value || undefined) as MeetingBody | undefined,
                })
              }
              className={inputClass}
            >
              <option value="">Any meeting</option>
              {Object.entries(MEETING_BODY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            value={template.description ?? ""}
            onChange={(e) => onChange({ ...template, description: e.target.value })}
            placeholder="When the secretary should pick this one"
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-3">
        {sections.map((s, i) => (
          <div
            key={s.id}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-5"
          >
            <div className="flex items-start gap-3">
              <input
                value={s.title}
                onChange={(e) => update(s.id, { title: e.target.value })}
                placeholder="Section heading"
                className={`flex-1 ${inputClass} font-medium`}
              />
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => move(s.id, -1)}
                  disabled={i === 0}
                  aria-label="Move up"
                  className="px-2 py-1 text-gray-400 hover:text-dark disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(s.id, 1)}
                  disabled={i === sections.length - 1}
                  aria-label="Move down"
                  className="px-2 py-1 text-gray-400 hover:text-dark disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => commit(sections.filter((x) => x.id !== s.id))}
                  className="px-2 py-1 text-xs text-risk-high hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setExpanded(expanded === s.id ? null : s.id)}
              className="mt-2 text-xs text-gray-500 hover:text-primary"
            >
              {expanded === s.id ? "Hide" : "Standing wording and people"}
              {(s.staticContent || s.personIds?.length) && expanded !== s.id && (
                <span className="ml-2 text-primary">
                  {s.staticContent ? "has wording" : ""}
                  {s.staticContent && s.personIds?.length ? ", " : ""}
                  {s.personIds?.length ? `${s.personIds.length} linked` : ""}
                </span>
              )}
            </button>

            {expanded === s.id && (
              <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Wording that carries over
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Copied into every set of minutes made from this template, and
                    editable for each meeting. Good for the attendee list or a
                    previous minutes sign off, which barely change.
                  </p>
                  <textarea
                    value={s.staticContent ?? ""}
                    onChange={(e) => update(s.id, { staticContent: e.target.value })}
                    rows={4}
                    placeholder={"Present:\n\nApologies:"}
                    className={`${inputClass} text-sm`}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Who owns this section{" "}
                    <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    A note about who normally reports on it, so the secretary
                    knows who to chase. It does not restrict anything.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {people.map((p) => {
                      const on = s.personIds?.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() =>
                            update(s.id, {
                              personIds: on
                                ? (s.personIds || []).filter((x) => x !== p.id)
                                : [...(s.personIds || []), p.id],
                            })
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                            on
                              ? "bg-primary text-white border-primary"
                              : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {p.name} {p.surname ?? ""}
                          {p.position ? ` · ${p.position}` : ""}
                        </button>
                      );
                    })}
                    {people.length === 0 && (
                      <span className="text-xs text-gray-400">
                        Nobody on the People register yet.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            commit([...sections, { id: newId(), title: "", order: 0 }])
          }
          className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-primary hover:text-primary transition-colors"
        >
          Add a section
        </button>
      </div>

      {problem && <p className="text-sm text-risk-high">{problem}</p>}

      <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-100">
        <button
          onClick={async () => {
            setSaving(true);
            try {
              await onSave();
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving || !!problem}
          className="bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : template.id ? "Save template" : "Create template"}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-5 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>

        {onDelete && (
          <div className="ml-auto">
            {confirmDelete ? (
              <span className="text-sm text-risk-high flex items-center gap-3">
                {/* Safe to delete at any time: minutes COPY their sections, so
                    no existing record depends on this one. Said out loud,
                    because deleting a template sounds more dangerous than it is. */}
                Delete this template? Minutes already written keep their sections.
                <button onClick={onDelete} className="font-medium underline">
                  Delete
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-gray-500">
                  Keep
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-sm text-risk-high hover:underline"
              >
                Delete template
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
