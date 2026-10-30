"use client";

import { useState } from "react";

// The demo school only: refills it with the invented governing body, minutes,
// actions, spend and Campus progress (POST demo-seed, reset). The platform
// pages run on the Clerk cookie, so a plain fetch, not authFetch.
export default function PlatformDemoSeed({ schoolKey }: { schoolKey: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  const run = async () => {
    if (!confirm(`Refill "${schoolKey}" with demo data? Its people, actions and spend are replaced.`)) return;
    setBusy(true);
    setResult("");
    const res = await fetch(`/api/platform/schools/${schoolKey}/demo-seed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: schoolKey, reset: true }),
    });
    const body = await res.json().catch(() => ({}));
    setResult(
      res.ok
        ? `Done: ${body.wrote?.people ?? 0} people, ${body.campus?.courses ?? 0} new courses, ${body.campus?.users ?? 0} new logins, ${body.campus?.progress ?? 0} leaderboard records.`
        : body.error || body.message || `Failed (${res.status})`
    );
    setBusy(false);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
      <p className="font-semibold text-dark">Demo data</p>
      <p className="text-sm text-gray-500 mt-1">
        Refills the demo school: governing body, minutes, actions, spend, every Campus course and invented leaderboard scores.
      </p>
      <button onClick={run} disabled={busy} className="mt-3 bg-dark text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
        {busy ? "Refilling..." : "Refill demo school"}
      </button>
      {result && <p className="text-sm mt-2">{result}</p>}
    </div>
  );
}
