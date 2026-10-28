"use client";

import { useT } from "@/components/I18nProvider";

// The warning and reason box shown when someone not assigned to an action (an
// administrator included) moves its status or progress. Shared by the Update
// progress box and the Edit form so the two cannot drift.
export default function NotOwnerReason({
  value,
  onChange,
}: {
  value: string;
  onChange: (reason: string) => void;
}) {
  const t = useT();
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
      <p className="text-sm font-semibold text-amber-800">
        {t("You are not the owner of this action item!")}
      </p>
      <label className="block text-sm font-medium text-amber-900" htmlFor="not-owner-reason">
        {t("Why are you changing the status?")}
      </label>
      <textarea
        id="not-owner-reason"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        maxLength={2000}
        className="w-full px-3 py-2 border border-amber-200 bg-white rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
      />
    </div>
  );
}
