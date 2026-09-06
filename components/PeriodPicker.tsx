"use client";

import { checkPeriod, type MeetingPeriod } from "@/lib/minutes";

// Carl asked for "year + month or year + quarter or year AND custom period the
// user can select". Three shapes behind one control, so the form does not grow
// three sets of fields that can contradict each other.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const inputClass =
  "px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition";

export default function PeriodPicker({
  value,
  onChange,
}: {
  value: MeetingPeriod;
  onChange: (p: MeetingPeriod) => void;
}) {
  const thisYear = new Date().getFullYear();
  // A school loading historical minutes needs to go back; five years forward
  // covers planning a meeting calendar.
  const years = Array.from({ length: 11 }, (_, i) => thisYear + 5 - i);
  const problem = checkPeriod(value);

  // Switching kind keeps the year, because that is the one thing the person
  // has already decided and should not have to pick twice.
  const switchKind = (kind: MeetingPeriod["kind"]) => {
    const year = value.year;
    if (kind === "month") onChange({ kind: "month", year, month: new Date().getMonth() + 1 });
    else if (kind === "quarter") onChange({ kind: "quarter", year, quarter: 1 });
    else
      onChange({
        kind: "custom",
        year,
        from: `${year}-01-01`,
        to: `${year}-03-31`,
        label: "",
      });
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Period these minutes cover
      </label>

      <div className="flex gap-2 mb-3">
        {(["month", "quarter", "custom"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => switchKind(k)}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
              value.kind === k
                ? "bg-primary text-white border-primary"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {k === "month" ? "Month" : k === "quarter" ? "Quarter" : "Custom dates"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={value.year}
          onChange={(e) => onChange({ ...value, year: Number(e.target.value) })}
          className={inputClass}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        {value.kind === "month" && (
          <select
            value={value.month}
            onChange={(e) => onChange({ ...value, month: Number(e.target.value) })}
            className={inputClass}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        )}

        {value.kind === "quarter" && (
          <select
            value={value.quarter}
            onChange={(e) =>
              onChange({ ...value, quarter: Number(e.target.value) as 1 | 2 | 3 | 4 })
            }
            className={inputClass}
          >
            {[1, 2, 3, 4].map((q) => (
              <option key={q} value={q}>
                Q{q}
              </option>
            ))}
          </select>
        )}

        {value.kind === "custom" && (
          <>
            <input
              type="date"
              value={value.from}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
              className={inputClass}
              aria-label="From"
            />
            <input
              type="date"
              value={value.to}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              className={inputClass}
              aria-label="To"
            />
            <input
              type="text"
              value={value.label ?? ""}
              onChange={(e) => onChange({ ...value, label: e.target.value })}
              placeholder="Name it, e.g. Term 1"
              className={`${inputClass} flex-1 min-w-[140px]`}
            />
          </>
        )}
      </div>

      {problem && <p className="mt-2 text-sm text-risk-high">{problem}</p>}
    </div>
  );
}
