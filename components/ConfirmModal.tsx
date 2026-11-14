"use client";

import { useEffect, useRef, type ReactNode } from "react";

// A yes/no question asked on the page, never in a browser box (Carl: "it is a
// browser message (which i dont like)"). Focus starts on the SAFE button.
export default function ConfirmModal({
  title,
  children,
  yesLabel,
  noLabel,
  busy,
  onYes,
  onNo,
}: {
  title: string;
  children?: ReactNode;
  yesLabel: string;
  noLabel: string;
  busy?: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  const onNoRef = useRef(onNo);
  useEffect(() => {
    onNoRef.current = onNo;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onNoRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onNo();
      }}
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-q" className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-6 space-y-2">
          <p id="confirm-q" className="font-semibold text-dark">{title}</p>
          {children && <div className="text-sm text-gray-600 space-y-2">{children}</div>}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            type="button"
            onClick={onNo}
            disabled={busy}
            autoFocus
            className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors disabled:opacity-50"
          >
            {noLabel}
          </button>
          <button
            type="button"
            onClick={onYes}
            disabled={busy}
            className="bg-primary hover:opacity-90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
          >
            {yesLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
