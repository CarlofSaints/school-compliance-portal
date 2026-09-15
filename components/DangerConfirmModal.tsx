"use client";

import { useEffect, useState } from "react";

// A destructive action that cannot be taken back, confirmed by TYPING a word
// rather than clicking OK. A click is muscle memory; typing DELETE is a
// decision. The route behind it must check the word too - see the minutes
// DELETE route - or the dialog is the only thing standing in the way.

const WORD = "DELETE";

export default function DangerConfirmModal({
  title,
  itemName,
  actionLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  /** What is about to go, shown so nobody deletes the wrong row. */
  itemName: string;
  actionLabel: string;
  /** Receives the typed word, to send to the server. Throw or return an error
   *  message to keep the dialog open. */
  onConfirm: (typed: string) => Promise<string | void>;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const matches = typed.trim() === WORD;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const confirm = async () => {
    if (!matches || busy) return;
    setBusy(true);
    setError("");
    try {
      const problem = await onConfirm(typed.trim());
      if (problem) setError(problem);
    } catch {
      setError("Something went wrong. Nothing was deleted.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-dark">{title}</h2>
          <p className="text-xs text-gray-500 mt-1 break-words">{itemName}</p>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-lg border border-risk-high/30 bg-risk-high/10 px-4 py-3 text-sm text-risk-high">
            <span className="font-bold tracking-wide">DANGER</span>
            <p className="mt-1">
              This action cannot be undone. Type in the word &quot;DELETE&quot; to
              confirm.
            </p>
          </div>

          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirm();
            }}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder={WORD}
            aria-label='Type DELETE to confirm'
            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-risk-high focus:border-transparent outline-none transition"
          />

          {error && <p className="text-sm text-risk-high">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!matches || busy}
            className="bg-risk-high hover:opacity-90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "Deleting..." : actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
