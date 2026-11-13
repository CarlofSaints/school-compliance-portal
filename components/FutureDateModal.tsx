"use client";

import { useEffect } from "react";
import { useT } from "@/components/I18nProvider";
import { formatMeetingDate } from "@/lib/minutes";

// "This meeting date is in the future" asked on the page, not in a browser
// box. Carl: "it is a browser message (which i dont like)". A soft gate:
// Yes carries on, Change the date puts it back.
export default function FutureDateModal({ date, onYes, onNo }: { date: string; onYes: () => void; onNo: () => void }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onNo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNo]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onNo();
      }}
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby="future-date-q" className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-6 space-y-2">
          <p id="future-date-q" className="font-semibold text-dark">
            {t("This meeting date is in the future. Are you sure you want to continue?")}
          </p>
          <p className="text-sm text-gray-500">{formatMeetingDate(date, t)}</p>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            type="button"
            onClick={onNo}
            className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors"
          >
            {t("Change the date")}
          </button>
          <button
            type="button"
            onClick={onYes}
            autoFocus
            className="bg-primary hover:opacity-90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-opacity"
          >
            {t("Yes, continue")}
          </button>
        </div>
      </div>
    </div>
  );
}
