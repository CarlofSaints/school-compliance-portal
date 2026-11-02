"use client";

import { useState } from "react";

// The steps of moving a school (lib/tenantMove.ts), one button each, in order.
// The old store's token is kept in this page's memory only, never saved.

type Look = { fullName: string; shortName: string; primary: string; accent: string; logoFile: string };

export default function MoveSchool({ looks }: { looks: Record<string, Look> }) {
  const [key, setKey] = useState("jeppe");
  const [name, setName] = useState(looks.jeppe?.fullName ?? "");
  const [testHost, setTestHost] = useState("jeppe-new.schoolcompliance.co.za");
  const [realHost, setRealHost] = useState("jeppe.schoolcompliance.co.za");
  const [token, setToken] = useState("");
  const [prefix, setPrefix] = useState("jeppe/");
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const say = (line: string) => setLog((l) => [...l, `${new Date().toLocaleTimeString()}  ${line}`]);

  async function step(action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch("/api/platform/move-school", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, key, sourceToken: token, sourcePrefix: prefix, ...extra }),
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
    const d = await step("create", { name, testHostname: testHost });
    say(`✅ Created "${d.tenant.name}" on ${d.tenant.hostnames.join(", ")}`);
  });

  const copy = run(async () => {
    let cursor: string | undefined;
    let files = 0;
    let bytes = 0;
    do {
      const d = await step("copy", { cursor });
      files += d.copied;
      bytes += d.bytes;
      say(`Copied ${files} files (${(bytes / 1024 / 1024).toFixed(1)} MB)${d.skipped ? `, left ${d.skipped} two-step sign-in record(s) behind` : ""}...`);
      cursor = d.hasMore ? d.cursor : undefined;
    } while (cursor);
    say(`✅ Copy finished: ${files} files.`);
  });

  const brand = run(async () => {
    const look = looks[key];
    if (!look) throw new Error(`No built-in look for "${key}".`);
    const d = await step("brand", { look });
    say(`✅ Branding: ${d.branding.fullName}, ${d.branding.primary} / ${d.branding.accent}${d.branding.logo ? ", crest" : ""}`);
  });

  const check = run(async () => {
    const d = await step("compare");
    const same = d.source.files === d.moved.files;
    say(
      `${same ? "✅" : "⚠️"} Old: ${d.source.files} files (${(d.source.bytes / 1024 / 1024).toFixed(1)} MB). New: ${d.moved.files} files (${(d.moved.bytes / 1024 / 1024).toFixed(1)} MB).` +
        (d.outsidePrefix ? ` ${d.outsidePrefix} file(s) in the old store sit OUTSIDE ${prefix}: look at those before switching.` : "") +
        (same ? "" : " (The new side can have one or two more: the branding files.)")
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
        <label className="text-xs text-gray-500">School key (its folder)
          <input className={input} value={key} onChange={(e) => setKey(e.target.value.trim().toLowerCase())} />
        </label>
        <label className="text-xs text-gray-500">Name
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-xs text-gray-500">Test address (checked before the switch)
          <input className={input} value={testHost} onChange={(e) => setTestHost(e.target.value.trim().toLowerCase())} />
        </label>
        <label className="text-xs text-gray-500">Real address (added in the last step)
          <input className={input} value={realHost} onChange={(e) => setRealHost(e.target.value.trim().toLowerCase())} />
        </label>
        <label className="text-xs text-gray-500 sm:col-span-2">Old app&apos;s Blob read-write token (vercel_blob_rw_...). Used for each step, never saved.
          <input type="password" autoComplete="off" className={input} value={token} onChange={(e) => setToken(e.target.value.trim())} />
        </label>
        <label className="text-xs text-gray-500">Old app&apos;s folder in that store
          <input className={input} value={prefix} onChange={(e) => setPrefix(e.target.value.trim())} />
        </label>
      </section>

      <section className="space-y-3 rounded-xl border border-gray-100 bg-white p-5 text-sm">
        <div className="flex flex-wrap items-center gap-3"><button className={btn} disabled={busy} onClick={create}>1. Create the empty school</button><span className="text-gray-500">on the test address, with its own store</span></div>
        <div className="flex flex-wrap items-center gap-3"><button className={btn} disabled={busy || !token} onClick={copy}>2. Copy every file</button><span className="text-gray-500">safe to run again; run it once more just before the switch</span></div>
        <div className="flex flex-wrap items-center gap-3"><button className={btn} disabled={busy} onClick={brand}>3. Apply its colours and crest</button><span className="text-gray-500">keeps anything the school saved itself</span></div>
        <div className="flex flex-wrap items-center gap-3"><button className={btn} disabled={busy || !token} onClick={check}>4. Compare old and new</button><span className="text-gray-500">then sign in on the test address and look around</span></div>
        <div className="flex flex-wrap items-center gap-3"><button className={btn} disabled={busy} onClick={addReal}>5. Add the real address</button><span className="text-gray-500">only AFTER the address is removed from the old Vercel project</span></div>
      </section>

      <pre className="min-h-[8rem] whitespace-pre-wrap rounded-xl bg-gray-900 p-4 text-xs text-gray-100">{log.join("\n") || "Nothing run yet."}</pre>
    </div>
  );
}
