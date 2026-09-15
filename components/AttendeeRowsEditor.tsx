"use client";

import {
  ATTENDANCE_STATUS_LABELS,
  type AttendanceStatus,
  type AttendeeRow,
} from "@/lib/minutes";

// The two-column attendance grid, shared by the template editor and the
// minutes editor so the list is edited the same way in both.
//
// 🔴 Declared at MODULE level. A component declared inside another is a new
// type on every render, so React remounts it and every keystroke would lose
// focus in the box being typed into.

const cell =
  "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition";

const STATUSES: AttendanceStatus[] = ["apology", "absent"];

export default function AttendeeRowsEditor({
  rows,
  onChange,
  people,
  fillNames = true,
  showStatus = false,
}: {
  rows: AttendeeRow[];
  onChange: (rows: AttendeeRow[]) => void;
  /** The People register, for "Fill from People register" and for showing who
   *  holds a position today. Left out where it is not loaded. */
  people?: { name: string; position?: string }[];
  /**
   * Whether "Fill from People register" writes the NAMES in.
   *
   * 🔴 False in a TEMPLATE. A name typed into a template is frozen there and
   * goes stale at the next election; a blank one is filled in from the
   * register each time minutes are started. So a template gets the positions
   * with empty names, and the current holder is shown greyed in the box.
   */
  fillNames?: boolean;
  /**
   * The Apology and Not Present ticks. Minutes only: who was away is a fact
   * about ONE meeting, so a template has nothing to tick.
   */
  showStatus?: boolean;
}) {
  const holderOf = (position: string): string => {
    const wanted = position.trim().toLowerCase();
    if (!wanted || !people) return "";
    return people
      .filter((p) => (p.position || "").trim().toLowerCase() === wanted && p.name?.trim())
      .map((p) => p.name.trim())
      .join(", ");
  };

  const set = (i: number, patch: Partial<AttendeeRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  // The two ticks are exclusive: somebody either sent an apology or simply
  // did not come. Ticking one clears the other; unticking leaves them present.
  const setStatus = (i: number, status: AttendanceStatus, on: boolean) =>
    onChange(
      rows.map((r, j) => {
        if (j !== i) return r;
        const next = { ...r };
        if (on) next.status = status;
        else delete next.status;
        return next;
      })
    );

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  // Adds a row for every filled seat on the register that is not already in
  // the list. Never replaces what is there: somebody who has already typed
  // "Mrs Lester (DL)" keeps it.
  const fillFromRegister = () => {
    const have = new Set(rows.map((r) => r.position.trim().toLowerCase()));
    const seen = new Set<string>();
    const extra: AttendeeRow[] = [];
    for (const p of people ?? []) {
      const position = (p.position || "").trim();
      const key = position.toLowerCase();
      if (!position || !p.name?.trim() || have.has(key) || seen.has(key)) continue;
      seen.add(key);
      extra.push({ position, name: fillNames ? holderOf(position) : "" });
    }
    onChange([...rows, ...extra]);
  };

  const canFill = !!people?.some((p) => p.position?.trim() && p.name?.trim());
  const columns = showStatus
    ? "sm:grid-cols-[1fr_1fr_auto_auto]"
    : "sm:grid-cols-[1fr_1fr_auto]";

  return (
    <div>
      {rows.length > 0 && (
        <div className={`hidden sm:grid ${columns} gap-2 mb-1 text-xs font-medium text-gray-500`}>
          <span>Position</span>
          <span>Name</span>
          {showStatus && <span className="w-44">Away</span>}
          <span className="w-28" />
        </div>
      )}
      <div className="space-y-2">
        {rows.map((r, i) => {
          const holder = holderOf(r.position);
          return (
            <div key={i} className={`grid grid-cols-1 ${columns} gap-2 items-center`}>
              <input
                value={r.position}
                onChange={(e) => set(i, { position: e.target.value })}
                placeholder="e.g. Chair"
                aria-label={`Position, row ${i + 1}`}
                className={cell}
              />
              <input
                value={r.name}
                onChange={(e) => set(i, { name: e.target.value })}
                placeholder={
                  holder
                    ? `${holder} (from the People register)`
                    : fillNames
                      ? "e.g. Mrs Lester (DL)"
                      : "Blank fills from the People register"
                }
                aria-label={`Name, row ${i + 1}`}
                className={`${cell} ${r.status ? "text-gray-400 line-through" : ""}`}
              />
              {showStatus && (
                <div className="flex items-center gap-4 w-44 text-xs text-gray-700">
                  {STATUSES.map((status) => (
                    <label key={status} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={r.status === status}
                        onChange={(e) => setStatus(i, status, e.target.checked)}
                        aria-label={`${ATTENDANCE_STATUS_LABELS[status]}, row ${i + 1}`}
                        className="rounded border-gray-300"
                      />
                      {ATTENDANCE_STATUS_LABELS[status]}
                    </label>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1 w-28 justify-end">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Move row up"
                  className="px-1.5 py-1 text-gray-400 hover:text-dark disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === rows.length - 1}
                  aria-label="Move row down"
                  className="px-1.5 py-1 text-gray-400 hover:text-dark disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onChange(rows.filter((_, j) => j !== i))}
                  className="px-1.5 py-1 text-xs text-risk-high hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        <button
          type="button"
          onClick={() => onChange([...rows, { position: "", name: "" }])}
          className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-700 hover:bg-gray-50"
        >
          Add a row
        </button>
        {canFill && (
          <button
            type="button"
            onClick={fillFromRegister}
            className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            Fill from People register
          </button>
        )}
      </div>
    </div>
  );
}
