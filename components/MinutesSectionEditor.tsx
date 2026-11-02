"use client";

import { useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/useAuth";
import {
  isApologies,
  isAttendance,
  rowsFromText,
  sectionListGroups,
  sectionNumbers,
  withApologiesSection,
  type MinutesSection,
} from "@/lib/minutes";
import AttendeeRowsEditor from "@/components/AttendeeRowsEditor";
import { AttendanceGroups } from "@/components/AttendanceList";
import { useT } from "@/components/I18nProvider";
import MinutesBody from "@/components/MinutesBody";
import RichTextEditor from "@/components/RichTextEditor";
import type { Editor } from "@tiptap/react";

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
  minutesId,
  sections,
  editable,
  onChange,
  onCaptureAction,
}: {
  /** For pictures: they are stored with these minutes. */
  minutesId: string;
  sections: MinutesSection[];
  editable: boolean;
  onChange: (next: MinutesSection[]) => void;
  /** Present when this person may add to the action register. Resolves true
   *  once the action is saved. */
  onCaptureAction?: (sectionId: string, text: string) => Promise<boolean>;
}) {
  const t = useT();
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  // The editors, so the capture button can read where the cursor is.
  const editors = useRef(new Map<string, Editor>());
  const [capturing, setCapturing] = useState<string | null>(null);
  const [captureHint, setCaptureHint] = useState<{ id: string; text: string } | null>(null);
  // The People register, for "Fill from People register" on an attendance
  // list. Only fetched while the minutes can still be edited.
  const [people, setPeople] = useState<{ id: string; name: string; position?: string }[] | undefined>(undefined);
  useEffect(() => {
    if (!editable) return;
    let live = true;
    authFetch("/api/people/directory")
      .then(async (res) => {
        if (res.ok && live) setPeople(await res.json());
      })
      // No register means no Fill button, nothing worse.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [editable]);

  // People to tag: one per name (a person holding two seats appears once),
  // nobody without a name.
  const taggable = (() => {
    const seen = new Set<string>();
    return (people ?? []).filter((p) => {
      const key = p.name.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((p) => ({ id: p.id, name: p.name.trim() }));
  })();

  const capture = async (s: MinutesSection) => {
    const ed = editors.current.get(s.id);
    // The selected text, else the paragraph (or table cell, list item) the cursor is in.
    let text = "";
    if (ed) {
      const { from, to, $from } = ed.state.selection;
      text = (to > from ? ed.state.doc.textBetween(from, to, "\n") : $from.parent.textContent).trim();
    }
    if (!text) {
      setCaptureHint({ id: s.id, text: t("Click into the point you want, or select its text, then press the button.") });
      return;
    }
    setCaptureHint(null);
    setCapturing(s.id);
    await onCaptureAction?.(s.id, text);
    setCapturing(null);
  };

  const ordered = [...sections].sort((a, b) => a.order - b.order);
  // Same helper as the template editor and the Word export.
  const numbers = sectionNumbers(sections);

  // Order is rewritten from array position on every change, so it is always
  // 1..n with no gaps. It is part of the signing hash, so it cannot be allowed
  // to drift or two identical-looking documents would hash differently.
  //
  // 🔴 Minutes with an attendance list always get an Apologies section, the
  // moment they have one. Ticking somebody away moves them out of the list,
  // and without somewhere to move to they would disappear from the page.
  const commit = (next: MinutesSection[]) => {
    const renumbered = next.map((s, i) => ({ ...s, order: i + 1 }));
    onChange(renumbered.some(isAttendance) ? withApologiesSection(renumbered) : renumbered);
  };

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
        {t("These minutes have no written sections. They may exist as an uploaded file above.")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {ordered.map((s, i) => {
        // The lists this section draws: the people present, or for Apologies
        // the two lists worked out from the ticks. One helper, shared with the
        // sign page and the Word file.
        const groups = sectionListGroups(s, ordered);
        return (
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
                  placeholder={t("Section heading")}
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
                    aria-label={t("Move up")}
                    className="px-2 py-1 text-gray-400 hover:text-dark disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(s.id, 1)}
                    disabled={i === ordered.length - 1}
                    aria-label={t("Move down")}
                    className="px-2 py-1 text-gray-400 hover:text-dark disabled:opacity-30"
                  >
                    ↓
                  </button>
                  {/* Apologies is permanent: it is where people ticked away go. */}
                  {!isApologies(s) && (
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(s.id)}
                      className="px-2 py-1 text-xs text-risk-high hover:underline"
                    >
                      {t("Remove")}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Carl: "tag a section with any user/s from a dropdown" - the person
                who reported it, say. Their initials print in the Responsible column. */}
            {(editable || !!s.tags?.length) && (
              <div className="mb-3 ml-11 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-gray-400">{t("People:")}</span>
                {(s.tags ?? []).map((tag) => (
                  <span key={tag.id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
                    {tag.name}
                    {editable && (
                      <button
                        type="button"
                        onClick={() => update(s.id, { tags: (s.tags ?? []).filter((x) => x.id !== tag.id) })}
                        aria-label={t("Untag {name}", { name: tag.name })}
                        className="text-gray-400 hover:text-dark"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {editable && taggable.length > 0 && (
                  <select
                    value=""
                    aria-label={t("Tag person")}
                    onChange={(e) => {
                      const p = taggable.find((x) => x.id === e.target.value);
                      if (p) update(s.id, { tags: [...(s.tags ?? []), { id: p.id, name: p.name }] });
                    }}
                    className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs"
                  >
                    <option value="">+ {t("Tag person")}</option>
                    {taggable
                      .filter((p) => !(s.tags ?? []).some((x) => x.id === p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                )}
                {editable && !s.tags?.length && <span className="text-gray-400">{t("nobody tagged")}</span>}
              </div>
            )}

            {confirmRemove === s.id && (
              // Confirmed, because a section can hold a whole meeting's worth of
              // typing and there is no undo.
              <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-risk-high flex items-center gap-3">
                <span>{t('Remove "{title}" and its notes?', { title: s.title || t("this section") })}</span>
                <button onClick={() => remove(s.id)} className="font-medium underline">
                  {t("Remove")}
                </button>
                <button onClick={() => setConfirmRemove(null)} className="text-gray-500">
                  {t("Keep")}
                </button>
              </div>
            )}

            {editable && !isApologies(s) && (
              <div className="flex flex-wrap gap-2 mb-3">
                {(["text", "attendance"] as const).map((k) => {
                  const on = (k === "attendance") === isAttendance(s);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() =>
                        update(s.id, {
                          kind: k === "attendance" ? "attendance" : undefined,
                          attendees: k === "attendance" ? s.attendees ?? [] : s.attendees,
                        })
                      }
                      className={`px-3 py-1 rounded-lg text-xs border transition-colors ${
                        on
                          ? "bg-primary text-white border-primary"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {k === "text" ? t("Text") : t("Attendance list")}
                    </button>
                  );
                })}
              </div>
            )}

            {isAttendance(s) &&
              (editable ? (
                <div className="mb-3">
                  {(s.attendees?.length ?? 0) === 0 && rowsFromText(s.body).rows.length > 0 && (
                    <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 flex flex-wrap items-center gap-3">
                      <span>{t("You typed a list in the box below. Turn it into rows?")}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const { rows, leftover } = rowsFromText(s.body);
                          update(s.id, { attendees: rows, body: leftover });
                        }}
                        className="font-medium underline"
                      >
                        {t("Turn my typed list into rows")}
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mb-2">
                    {t("Tick")} <span className="font-medium">{t("Apology")}</span>{" "}
                    {t("or")} <span className="font-medium">{t("Not Present")}</span>{" "}
                    {t("and that person moves to the Apologies section.")}
                  </p>
                  <AttendeeRowsEditor
                    rows={s.attendees ?? []}
                    onChange={(rows) => update(s.id, { attendees: rows })}
                    people={people}
                    showStatus
                  />
                </div>
              ) : (
                <div className="mb-2">
                  <AttendanceGroups groups={groups} />
                </div>
              ))}

            {isApologies(s) && (
              <div className="mb-3">
                {editable && (
                  <p className="text-xs text-gray-500 mb-2">
                    {t("Filled in from the attendance list: anyone ticked Apology is listed here, and anyone ticked Not Present under Not in Attendance.")}
                  </p>
                )}
                <AttendanceGroups groups={groups} />
              </div>
            )}

            {editable ? (
              <>
              <RichTextEditor
                minutesId={minutesId}
                doc={s.doc}
                body={s.body}
                placeholder={
                  isApologies(s)
                    ? t("Anything else to record about apologies (optional)")
                    : isAttendance(s)
                      ? t("Wording under the list (optional)")
                      : t("What was discussed and decided")
                }
                onChange={(doc, body) => update(s.id, { doc, body })}
                names={people?.map((p) => p.name)}
                people={taggable}
                onReady={(ed) => {
                  if (ed) editors.current.set(s.id, ed);
                  else editors.current.delete(s.id);
                }}
              />
              <p className="mt-1 text-xs text-gray-400">
                {t("Format it like Word, paste tables and screenshots straight in.")}
              </p>
              {onCaptureAction && !isApologies(s) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <button
                    type="button"
                    // Kept from taking focus, so the cursor and any selection
                    // in the box are still there when the click lands.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => capture(s)}
                    disabled={capturing === s.id || !s.body.trim()}
                    title={t("Adds the text you have selected, or the paragraph your cursor is in, to the action list. Add who and when later.")}
                    className="text-xs font-medium text-primary hover:underline disabled:text-gray-300 disabled:no-underline"
                  >
                    {capturing === s.id ? t("Adding...") : t("+ Add to action items")}
                  </button>
                  {captureHint?.id === s.id && (
                    <span className="text-xs text-gray-500">{captureHint.text}</span>
                  )}
                </div>
              )}
              </>
            ) : s.body || groups.length === 0 ? (
              s.body ? (
                <MinutesBody minutesId={minutesId} body={s.body} doc={s.doc} />
              ) : (
                <p className="text-sm text-gray-400">{t("Nothing recorded.")}</p>
              )
            ) : null}
          </div>
        );
      })}

      {editable && (
        <button
          type="button"
          onClick={add}
          className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-primary hover:text-primary transition-colors"
        >
          {t("Add a section")}
        </button>
      )}
    </div>
  );
}
