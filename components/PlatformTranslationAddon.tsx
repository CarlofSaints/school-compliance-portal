"use client";

import { useEffect, useState } from "react";

// Carl's switch for one school's document-translation add-on. Platform pages
// authenticate with Clerk, so this is a plain fetch, not the portal's authFetch.
export default function PlatformTranslationAddon({ schoolKey }: { schoolKey: string }) {
  const [state, setState] = useState<{ enabled: boolean; monthlyCap: number; used: number } | null>(null);
  const [cap, setCap] = useState("20");
  const [msg, setMsg] = useState("");
  const url = `/api/platform/schools/${schoolKey}/translation`;

  useEffect(() => {
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setState(d);
        setCap(String(d.monthlyCap));
      })
      .catch(() => setMsg("Could not load the add-on setting."));
  }, [url]);

  const save = async (enabled: boolean) => {
    setMsg("");
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, monthlyCap: Number(cap) }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) setMsg(d.error || "Could not save.");
    else {
      setState(d);
      setMsg("Saved.");
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap items-center gap-4 text-sm">
      <div className="flex-1 min-w-60">
        <div className="font-medium text-dark">Document translation add-on (R100/month)</div>
        <div className="text-xs text-gray-500">
          {state
            ? state.enabled
              ? `ON. ${state.used} of ${state.monthlyCap} new translations used this month.`
              : "OFF. The school sees no Translate button."
            : "Loading…"}
        </div>
      </div>
      <label className="text-xs text-gray-500">
        Translations a month{" "}
        <input
          type="number"
          min={0}
          max={200}
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          className="ml-1 w-20 border border-gray-200 rounded px-2 py-1 text-sm"
        />
      </label>
      <button
        onClick={() => save(true)}
        disabled={!state}
        className="bg-primary text-white px-4 py-2 rounded-lg disabled:opacity-50"
      >
        {state?.enabled ? "Save allowance" : "Switch on"}
      </button>
      {state?.enabled && (
        <button onClick={() => save(false)} className="border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50">
          Switch off
        </button>
      )}
      {msg && <span className="text-xs text-gray-500">{msg}</span>}
    </div>
  );
}
