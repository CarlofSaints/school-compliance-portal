"use client";

import { useState } from "react";

// The steps of moving a school (lib/tenantMove.ts), one button each, in order.
// The old store's token is kept in this page's memory only, never saved.
// Everything else follows from the school key.

export default function MoveSchool({ schools }: { schools: Record<string, string> }) {
  const [key, setKey] = useState("jeppe");
  const [token, setToken] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // Where a copy got to: a failed batch carries on from here, not from the start.
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const testHost = `${key}-new.schoolcompliance.co.za`;
  const realHost = `${key}.schoolcompliance.co.za`;

  const say = (line: string) => setLog((l) => [...l, `${new Date().toLocaleTimeString()}  ${line}`]);

  async function step(action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch("/api/platform/move-school", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, key, sourceToken: token, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `That step failed (${res.status}).`);
    return data;
  }

  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      say(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const create = run(async () => {
    const d = await step("create", { testHostname: testHost });
    say(`✅ Created "${d.tenant.name}" on ${d.tenant.hostnames.join(", ")}, with its own colours and crest.`);
  });

  const copy = run(async () => {
    let at = cursor;
    let files = 0;
    let bytes = 0;
    if (at) say("Carrying on from where the last copy stopped...");
    do {
      const d = await step("copy", { cursor: at });
      files += d.copied;
      bytes += d.bytes;
      say(`Copied ${files} files (${(bytes / 1024 / 1024).toFixed(1)} MB)${d.skipped ? `, left ${d.skipped} two-step sign-in record(s) behind` : ""}...`);
      at = d.hasMore ? d.cursor : undefined;
      setCursor(at);
    } while (at);
    const p = await step("prune");
    say(`✅ Copy finished: ${files} files.${p.removed ? ` Removed ${p.removed} file(s) the old app no longer has.` : ""}`);
  });

  const check = run(async () => {
    const d = await step("compare");
    const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
    say(
      `${d.same ? "✅ Identical" : "⚠️ Different"}. Old: ${d.source.files} files (${mb(d.source.bytes)} MB). New: ${d.moved.files} files (${mb(d.moved.bytes)} MB).` +
        (d.missingCount ? ` Missing on the new side (${d.missingCount}): ${d.missing.join(", ")}.` : "") +
        (d.differentSize.length ? ` Different size: ${d.differentSize.join(", ")}.` : "") +
        (d.extra.length ? ` Only on the new side: ${d.extra.join(", ")}.` : "") +
        (d.outsidePrefix ? ` ${d.outsidePrefix} file(s) in the old store sit OUTSIDE ${key}/: look at those before switching.` : "")
    );
  });

  const addReal = run(async () => {
    const s = await step("status");
    const d = await step("hostnames", { hostnames: [...new Set([...s.hostnames, realHost])] });
    say(`✅ Now answers on: ${d.hostnames.join(", ")}`);
  });

  const input = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm";
  const btn = "rounded-lg bg-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-40";

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        The old app is only ever READ. Nothing here changes it, so stopping half way costs nothing. Do it when nobody is
        using the school, and download a backup from the old app first (Admin, Backup Data).
      </div>

      <section className="grid grid-cols-1 gap-3 rounded-xl border border-gray-100 bg-white p-5 sm:grid-cols-2">
        <label className="text-xs text-gray-500">School
          <select className={input} value={key} onChange={(e) => { setKey(e.target.value); setCursor(undefined); }}>
            {Object.entries(schools).map(([k, name]) => (
              <option key={k} value={k}>{name} ({k})</option>
            ))}
          </select>
        </label>
        <div className="text-xs text-gray-500">
          Test address: <span className="font-medium text-dark">{testHost}</span>
          <br />
          Real address: <span className="font-medium text-dark">{realHost}</span>
          <br />
          Old app&apos;s folder: <span className="font-medium text-dark">{key}/</span>
        </div>
        <label className="text-xs text-gray-500 sm:col-span-2">Old app&apos;s Blob read-write token (vercel_blob_rw_...). Used for each step, never saved.
          <input type="password" autoComplete="off" className={input} value={token} onChange={(e) => setToken(e.target.value.trim())} />
        </label>
      </section>

      <section className="space-y-3 rounded-xl border border-gray-100 bg-white p-5 text-sm">
        <div className="flex flex-wrap items-center gap-3"><button className={btn} disabled={busy} onClick={create}>1. Create the empty school</button><span className="text-gray-500">on the test address, its own store, its own colours and crest</span></div>
        <div className="flex flex-wrap items-center gap-3"><button className={btn} disabled={busy || !token} onClick={copy}>2. Copy every file</button><span className="text-gray-500">safe to run again; run it once more just before the switch</span></div>
        <div className="flex flex-wrap items-center gap-3"><button className={btn} disabled={busy || !token} onClick={check}>3. Compare old and new</button><span className="text-gray-500">file by file; then sign in on the test address and look around</span></div>
        <div className="flex flex-wrap items-center gap-3"><button className={btn} disabled={busy} onClick={addReal}>4. Add the real address</button><span className="text-gray-500">only AFTER the address is removed from the old Vercel project</span></div>
      </section>

      <pre className="min-h-[8rem] whitespace-pre-wrap rounded-xl bg-gray-900 p-4 text-xs text-gray-100">{log.join("\n") || "Nothing run yet."}</pre>
    </div>
  );
}
