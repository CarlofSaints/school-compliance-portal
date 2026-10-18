"use client";

import { useEffect, useState } from "react";

// Carl's top-up of one school's document-translation credits, after the
// school has paid. Platform pages authenticate with Clerk, so this is a plain
// fetch, not the portal's authFetch.
export default function PlatformTranslationAddon({ schoolKey }: { schoolKey: string }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [add, setAdd] = useState("10");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const url = `/api/platform/schools/${schoolKey}/translation`;

  useEffect(() => {
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setBalance(d.balance))
      .catch(() => setMsg("Could not load the credit balance."));
  }, [url]);

  const save = async () => {
    // One press, one top-up: a double-click must not add the credits twice.
    if (saving) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ add: Number(add) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setMsg(d.error || "Could not save.");
      else {
        setBalance(d.balance);
        setMsg(`Added ${add}. New balance ${d.balance}.`);
        setAdd("");
      }
    } catch {
      setMsg("Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap items-center gap-4 text-sm">
      <div className="flex-1 min-w-60">
        <div className="font-medium text-dark">Document translation credits (R100 for 10, never expire)</div>
        <div className="text-xs text-gray-500">
          {balance === null ? "Loading…" : `${balance} credits left. 1 credit = up to 10 pages in one language.`}
        </div>
      </div>
      <label className="text-xs text-gray-500">
        Credits to add{" "}
        <input
          type="number"
          step={1}
          value={add}
          onChange={(e) => setAdd(e.target.value)}
          className="ml-1 w-20 border border-gray-200 rounded px-2 py-1 text-sm"
        />
      </label>
      <button onClick={save} disabled={balance === null || saving || !add}className="bg-primary text-white px-4 py-2 rounded-lg disabled:opacity-50">
        Add credits
      </button>
      {msg && <span className="text-xs text-gray-500">{msg}</span>}
    </div>
  );
}
