"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/useAuth";
import ActionItemForm from "@/components/ActionItemForm";
import { STATUS_LABELS, STATUS_PILL, type ActionStatus } from "@/lib/actionItems";
import { sectionNumbers, type MinutesSection } from "@/lib/minutes";

// ---------------------------------------------------------------------------
// Raising action items out of the minutes.
//
// The last piece of the original spec, and the point of both modules: the
// register exists because "until now they lived in the minutes, which nobody
// re-reads". Typing a decision into the minutes and then typing it AGAIN into
// the register is exactly the drift the register was built to stop.
//
// 🔴 Deliberately NOT gated on the minutes being editable. Actions come out of
// a meeting that has been HELD, and signed minutes are the most authoritative
// source of what was agreed. Raising an action changes nothing about the
// minutes, so a signed record is still a perfectly good thing to raise one
// from - never gate a control that PRODUCES data on the state of what it reads.
// ---------------------------------------------------------------------------

interface DirectoryPerson {
  id: string;
  position: string;
  name: string;
  email: string;
  hasLogin: boolean;
}

interface RaisedAction {
  id: string;
  ref: string;
  title: string;
  status: ActionStatus;
  dueDate: string;
  progress: number;
  assigneeNames: string[];
  sectionId?: string;
}

// ⚠️ No meetingDate is seeded onto the action, deliberately. Minutes carry a
// PERIOD ("September 2026", "Q3 2026"), not a date, and the register's
// meetingDate is a real ISO day. Deriving one would mean inventing a day the
// meeting may not have been held on, and a wrong date on the record is worse
// than an empty field somebody can fill in. The link back to the minutes
// already says which meeting it was, with the period spelled out.
interface Props {
  id: string;
  sections: MinutesSection[];
  canRaise: boolean;
  onToast: (message: string, type: "success" | "error") => void;
}

export default function MinutesActionsPanel({
  id,
  sections,
  canRaise,
  onToast,
}: Props) {
  const [actions, setActions] = useState<RaisedAction[] | null>(null);
  const [directory, setDirectory] = useState<DirectoryPerson[]>([]);
  // The section being raised from, or "" for the meeting as a whole.
  const [raisingFrom, setRaisingFrom] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await authFetch(`/api/minutes/${id}/actions`);
    // null stays null on a failure, so the panel says nothing rather than
    // claiming there are no actions when it simply could not look.
    if (res.ok) setActions(await res.json());
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!canRaise) return;
    authFetch("/api/people/directory").then(async (res) => {
      if (res.ok) setDirectory(await res.json());
    });
  }, [canRaise]);

  const numbers = sectionNumbers(sections);
  const ordered = [...sections].sort((a, b) => a.order - b.order);

  const seedFor = (sectionId: string) => {
    const section = ordered.find((s) => s.id === sectionId);
    if (!section) return undefined;
    return {
      title: section.title,
      // The minuted wording, so the person carrying the action can read what
      // was actually said rather than a one-line summary of it.
      description: section.body,
    };
  };

  if (raisingFrom !== null) {
    const section = ordered.find((s) => s.id === raisingFrom);
    return (
      <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-dark mb-1">Raise an action</h2>
        <p className="text-sm text-gray-500 mb-4">
          {section
            ? `From "${section.title}". Edit anything below - the minute is the starting point, not the action.`
            : "From this meeting as a whole."}
        </p>
        <ActionItemForm
          directory={directory}
          existing={null}
          seed={seedFor(raisingFrom)}
          fromMinutes={{ minutesId: id, sectionId: raisingFrom || undefined }}
          onCancel={() => setRaisingFrom(null)}
          onSaved={(message) => {
            setRaisingFrom(null);
            onToast(message, "success");
            load();
          }}
          onError={(message) => onToast(message, "error")}
        />
      </div>
    );
  }

  const raised = actions ?? [];

  return (
    <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold text-dark">Actions from this meeting</h2>
        {canRaise && (
          <button
            onClick={() => setRaisingFrom("")}
            className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors"
          >
            Raise an action
          </button>
        )}
      </div>

      {actions === null ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : raised.length === 0 ? (
        /* Absence said out loud. A blank panel reads as one that has not
           loaded, and "nothing yet" is the state a secretary is checking for. */
        <p className="text-sm text-gray-400 mb-4">
          Nothing has been raised from this meeting yet.
        </p>
      ) : (
        <ul className="mt-3 mb-4 space-y-2">
          {raised.map((a) => {
            const n = a.sectionId ? numbers.get(a.sectionId) : undefined;
            return (
              <li
                key={a.id}
                className="flex flex-wrap items-baseline gap-x-2 text-sm border-l-2 border-gray-200 pl-3"
              >
                <Link
                  href={`/action-items?ref=${encodeURIComponent(a.ref)}`}
                  className="text-primary hover:underline font-medium"
                >
                  {a.ref}
                </Link>
                <span className="text-dark">{a.title}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${STATUS_PILL[a.status]}`}
                >
                  {STATUS_LABELS[a.status]}
                </span>
                {a.assigneeNames.length > 0 && (
                  <span className="text-xs text-gray-400">
                    {a.assigneeNames.join(", ")}
                  </span>
                )}
                {a.dueDate && (
                  <span className="text-xs text-gray-400">
                    due {new Date(a.dueDate).toLocaleDateString("en-ZA")}
                  </span>
                )}
                {n != null && (
                  <span className="text-xs text-gray-400">from item {n}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Per section, because that is where somebody is reading when they
          notice an action. Sending them to a separate page to retype the
          minute is what keeps the two lists apart. */}
      {canRaise && ordered.length > 0 && (
        <div className="pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-2">Raise one from a specific item:</p>
          <div className="flex flex-wrap gap-2">
            {ordered.map((s) => (
              <button
                key={s.id}
                onClick={() => setRaisingFrom(s.id)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 hover:border-primary hover:text-primary text-xs text-gray-600 transition-colors"
              >
                {numbers.get(s.id) == null ? "" : `${numbers.get(s.id)}. `}
                {s.title || "Untitled section"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
