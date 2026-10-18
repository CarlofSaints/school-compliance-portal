"use client";

import { formatRand } from "@/lib/spendReport";
import { useT } from "@/components/I18nProvider";

export interface Allocation {
  source: string;
  amount: number;
}

interface Props {
  sources: string[];
  value: Allocation[];
  onChange: (next: Allocation[]) => void;
  estimatedAmount: number;
}

/**
 * Multi-source funding picker. A request can draw from several sources
 * (e.g. CAPEX + Fundraising); tick each source and enter how much comes from
 * it. Shows a running total against the estimated amount.
 */
export default function FundingSplit({
  sources,
  value,
  onChange,
  estimatedAmount,
}: Props) {
  const t = useT();
  const selected = new Map(value.map((a) => [a.source, a.amount]));
  const allocated = value.reduce((t, a) => t + (a.amount || 0), 0);
  const remainder = estimatedAmount - allocated;

  const toggle = (source: string) => {
    if (selected.has(source)) {
      onChange(value.filter((a) => a.source !== source));
    } else {
      // Default a newly-ticked source to whatever is still unallocated.
      const seed = value.length === 0 ? estimatedAmount : Math.max(remainder, 0);
      onChange([...value, { source, amount: seed }]);
    }
  };

  const setAmount = (source: string, amount: number) => {
    onChange(
      value.map((a) => (a.source === source ? { ...a, amount } : a))
    );
  };

  const mismatch = Math.abs(remainder) > 0.5 && value.length > 0;

  return (
    <div className="space-y-2">
      {sources.map((source) => {
        const isOn = selected.has(source);
        return (
          <div
            key={source}
            className={`flex items-center gap-3 rounded-lg border p-2.5 transition-colors ${
              isOn ? "border-primary/40 bg-primary/5" : "border-gray-200"
            }`}
          >
            <label className="flex flex-1 items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isOn}
                onChange={() => toggle(source)}
                className="w-4 h-4 text-primary focus:ring-primary rounded"
              />
              <span className="text-sm text-gray-700">{source}</span>
            </label>
            {isOn && (
              <div className="relative w-40">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                  R
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={selected.get(source) ?? ""}
                  onChange={(e) =>
                    setAmount(source, parseFloat(e.target.value) || 0)
                  }
                  className="w-full pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-center justify-between pt-1 text-xs">
        <span className="text-gray-500">
          {t("Allocated {allocated} of {estimate}", { allocated: formatRand(allocated), estimate: formatRand(estimatedAmount) })}
        </span>
        {mismatch ? (
          <span className="font-medium text-amber-600">
            {remainder > 0
              ? t("{amount} unallocated", { amount: formatRand(remainder) })
              : t("{amount} over", { amount: formatRand(-remainder) })}
          </span>
        ) : value.length > 0 ? (
          <span className="font-medium text-green-600">{t("Balanced")}</span>
        ) : (
          <span className="text-gray-400">{t("Select at least one source")}</span>
        )}
      </div>
    </div>
  );
}
