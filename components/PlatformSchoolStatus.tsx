"use client";

import { useState } from "react";

// Suspend a school that has left, bring it back, and once its 90 days are up
// delete it (lib/schoolRetention.ts). Platform pages use Clerk, so plain fetch.
export default function PlatformSchoolStatus({
  schoolKey,
  status: initialStatus,
  suspendedAt: initialSuspendedAt,
  dueOn: initialDueOn,
}: {
  schoolKey: string;
  status: "active" | "suspended";
  suspendedAt?: string;
  dueOn?: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [suspendedAt, setSuspendedAt] = useState(initialSuspendedAt);
  const [dueOn, setDueOn] = useState(initialDueOn);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const url = `/api/platform/schools/${schoolKey}`;
  const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }) : "");
  const isDue = !!dueOn && new Date(dueOn) <= new Date();

  const setTo = async (next: "active" | "suspended") => {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return setMsg(d.error || "Could not save.");
      setStatus(d.status);
      setSuspendedAt(d.suspendedAt);
      setDueOn(d.suspendedAt ? new Date(Date.parse(d.suspendedAt) + 90 * 86_400_000).toISOString() : undefined);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy || typed !== schoolKey) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(url, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: typed }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return setMsg(d.error || "Could not delete.");
      setMsg(d.problems ? `Partly deleted: ${d.problems.join(" ")}` : `Deleted: ${d.removed.blobs} files, store ${d.removed.store ? "removed" : "kept"}. You can close this page.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-sm">
      <h2 className="font-semibold text-dark mb-2">Access</h2>
      {status === "active" ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-gray-600">Active. Suspend a school that has stopped paying: its people can no longer sign in, and nothing is deleted.</span>
          <button onClick={() => setTo("suspended")} disabled={busy} className="border border-amber-300 text-amber-800 px-3 py-1.5 rounded-lg hover:bg-amber-50 disabled:opacity-50">
            Suspend
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-amber-800">
              Suspended {day(suspendedAt) || "(date not recorded)"}.{" "}
              {dueOn && (isDue ? <strong>Deletion was due {day(dueOn)}.</strong> : <>Delete on or after {day(dueOn)} (90 days).</>)}
            </span>
            <button onClick={() => setTo("active")} disabled={busy} className="border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              Reactivate
            </button>
          </div>
          <div className="border-t border-gray-100 pt-3">
            <p className="text-gray-600 mb-2">
              Delete permanently: every record, file and the school&apos;s store. Cannot be undone. Check first that nobody asked for a copy. Type <code className="bg-gray-100 px-1">{schoolKey}</code> to confirm.
            </p>
            <div className="flex gap-2">
              <input value={typed} onChange={(e) => setTyped(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5" aria-label="Type the school's address to confirm" />
              <button onClick={remove} disabled={busy || typed !== schoolKey} className="bg-red-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-40">
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
      {msg && <p className="mt-2 text-red-700">{msg}</p>}
    </div>
  );
}
