"use client";

import { useState } from "react";
import { sectionNumbers, type MinutesSection } from "@/lib/minutes";

// The minute-taking surface: sections a school defines for itself.
//
// 🔴 Declared at MODULE level, not inside the page component. A component
// declared inside another is a NEW component type on every render, so React
// unmounts and remounts it: every keystroke would lose focus in the textarea
// being typed into, which is unusable for the one job this has.

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());
}

export default function MinutesSectionEditor({
  sections,
  editable,
  onChange,
}: {
  sections: MinutesSection[];
  editable: boolean;
  onChange: (next: MinutesSection[]) => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const ordered = [...sections].sort((a, b) => a.order - b.order);
  // Same helper as the template editor and the Word export.
  const numbers = sectionNumbers(sections);

  // Order is rewritten from array position on every change, so it is always
  // 1..n with no gaps. It is part of the signing hash, so it cannot be allowed
  // to drift or two identical-looking documents would hash differently.
  const commit = (next: MinutesSection[]) =>
    onChange(next.map((s, i) => ({ ...s, order: i + 1 })));

  const update = (id: string, patch: Partial<MinutesSection>) =>
    commit(ordered.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const move = (id: string, dir: -1 | 1) => {
    const i = ordered.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ordered.length) return;
    const next = [...ordered];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };

  const add = () =>
    commit([...ordered, { id: newId(), title: "New section", body: "", order: 0 }]);

  const remove = (id: string) => {
    commit(ordered.filter((s) => s.id !== id));
    setConfirmRemove(null);
  };

  if (ordered.length === 0 && !editable) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-sm text-gray-400">
        These minutes have no written sections. They may exist as an uploaded
        file above.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {ordered.map((s, i) => (
        <div
          key={s.id}
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-5"
        >
          <div className="flex items-start gap-3 mb-3">
            <span className="mt-2.5 w-8 shrink-0 text-sm font-medium text-gray-400 tabular-nums">
              {numbers.get(s.id) == null ? "" : `${numbers.get(s.id)}.`}
            </span>
            {editable ? (
              <input
                value={s.title}
                onChange={(e) => update(s.id, { title: e.target.value })}
                placeholder="Section heading"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg font-medium text-dark focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
              />
            ) : (
              <h3 className="flex-1 font-semibold text-dark">{s.title}</h3>
            )}

            {editable && (
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
                  disabled={i === ordered.length - 1}
                  aria-label="Move down"
                  className="px-2 py-1 text-gray-400 hover:text-dark disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRemove(s.id)}
                  className="px-2 py-1 text-xs text-risk-high hover:underline"
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          {confirmRemove === s.id && (
            // Confirmed, because a section can hold a whole meeting's worth of
            // typing and there is no undo.
            <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-risk-high flex items-center gap-3">
              <span>Remove &quot;{s.title || "this section"}&quot; and its notes?</span>
              <button onClick={() => remove(s.id)} className="font-medium underline">
                Remove
              </button>
              <button onClick={() => setConfirmRemove(null)} className="text-gray-500">
                Keep
              </button>
            </div>
          )}

          {editable ? (
            <textarea
              value={s.body}
              onChange={(e) => update(s.id, { body: e.target.value })}
              rows={5}
              placeholder="What was discussed and decided"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
            />
          ) : (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {s.body || <span className="text-gray-400">Nothing recorded.</span>}
            </p>
          )}
        </div>
      ))}

      {editable && (
        <button
          type="button"
          onClick={add}
          className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-primary hover:text-primary transition-colors"
        >
          Add a section
        </button>
      )}
    </div>
  );
}
