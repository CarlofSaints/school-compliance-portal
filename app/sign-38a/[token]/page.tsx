"use client";

import { use, useEffect, useState } from "react";
import SignaturePad from "@/components/SignaturePad";
import SchoolCrest from "@/components/SchoolCrest";
import { useT } from "@/components/I18nProvider";

// The page behind a section 38A signing link. No login: the link in the email
// is the key. The undertakings stay in the form's own English, because that is
// the text being signed; everything around them follows the reader's language.

interface View {
  kind: "employee" | "chair";
  line?: "sgb" | "finance";
  school: string;
  year: number;
  name: string;
  terms: string;
  signed: boolean;
  undertaking: { intro: string; points: string[] };
  willingness?: string;
  entry?: { persal: string; rank: string; benefit: string; activities: string[]; description: string; times: string[]; timesOther: string; pay: string; amount: number; max: number };
  people?: { name: string; description: string; max: number }[];
}

const rand = (n: number) => `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4 py-1 text-sm"><span className="text-gray-500">{label}</span><span className="text-right">{value}</span></div>;
}

export default function Sign38aPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useT();
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [mark, setMark] = useState<{ dataUrl: string; kind: "drawn" | "typed" } | null>(null);
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const url = `/api/public/section-38a/${encodeURIComponent(token)}`;

  useEffect(() => {
    fetch(url).then(async (r) => {
      if (r.ok) setView(await r.json());
      else setMissing(true);
    });
  }, [url]);

  const post = async (body: Record<string, unknown>, thanks: string) => {
    setBusy(true);
    setError("");
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (res.ok) setDone(thanks);
    else setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? t("Something went wrong. Please try again."));
  };

  const body = () => {
    if (missing) return <p className="text-gray-600">{t("This link has expired or been replaced. Ask the school to send a new one.")}</p>;
    if (!view) return <p className="text-gray-500">{t("Loading...")}</p>;
    if (done) return <p className="text-gray-700">{done}</p>;
    if (view.signed) return <p className="text-gray-700">{t("You have already signed this. Thank you.")}</p>;
    const e = view.entry;
    return (
      <>
        <h1 className="text-xl font-bold text-dark">{t("Section 38A: please review")}</h1>
        <p className="text-sm text-gray-600 mt-1 mb-4">
          {view.kind === "employee"
            ? t("{school} wants to apply to pay you for extra work in {year}.", { school: view.school, year: view.year })
            : t("{school} needs your signature on its section 38A application for {year}.", { school: view.school, year: view.year })}
        </p>

        {e && (
          <div className="bg-gray-50 rounded-lg px-4 py-2 mb-4 divide-y divide-gray-100">
            <Row label={t("Name")} value={view.name} />
            <Row label={t("PERSAL number")} value={e.persal} />
            <Row label={t("Rank")} value={e.rank} />
            <Row label={t("Type of payment")} value={t(e.benefit)} />
            <Row label={t("Activities")} value={e.activities.map((a) => t(a)).join(", ")} />
            <Row label={t("Duties")} value={e.description} />
            <Row label={t("When is the work done?")} value={[...e.times.map((x) => t(x)), e.timesOther].filter(Boolean).join(", ")} />
            <Row label={t("Paid")} value={`${rand(e.amount)}, ${t(e.pay)}`} />
            <Row label={t("Year maximum")} value={rand(e.max)} />
          </div>
        )}
        {view.people && (
          <table className="w-full text-sm mb-4">
            <thead><tr className="text-left text-gray-500 border-b border-gray-100"><th className="py-1 pr-3 font-medium">{t("Person")}</th><th className="py-1 pr-3 font-medium">{t("Duties")}</th><th className="py-1 font-medium text-right">{t("Year maximum")}</th></tr></thead>
            <tbody>{view.people.map((p, i) => <tr key={i} className="border-b border-gray-50 align-top"><td className="py-1 pr-3">{p.name}</td><td className="py-1 pr-3">{p.description}</td><td className="py-1 text-right whitespace-nowrap">{rand(p.max)}</td></tr>)}</tbody>
          </table>
        )}

        <div lang="en" className="text-sm text-gray-700 space-y-2 border border-gray-100 rounded-lg p-4 mb-4">
          <p>{view.undertaking.intro}</p>
          <ol className="list-decimal pl-5 space-y-2">{view.undertaking.points.map((x, i) => <li key={i}>{x}</li>)}</ol>
          {view.willingness && <p>{view.willingness}</p>}
        </div>

        <label className="flex gap-2 text-sm mb-3">
          <input type="checkbox" checked={read} onChange={(ev) => setRead(ev.target.checked)} />
          {t("I have read this and I agree to it.")}
        </label>
        <SignaturePad name={view.name} onChange={setMark} />
        {error && <p role="alert" className="text-sm text-red-700 mt-3">{error}</p>}
        <div className="flex flex-col gap-2 mt-4">
          <button onClick={() => post({ action: "sign", dataUrl: mark?.dataUrl, kind: mark?.kind, terms: view.terms }, t("Signed. Thank you. You can close this page."))} disabled={busy || !read || !mark} className="bg-primary hover:bg-primary-dark disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium">
            {busy ? t("Signing...") : t("Sign and return")}
          </button>
          {view.kind === "employee" && problem === null && <button onClick={() => setProblem("")} className="border border-gray-200 text-dark px-4 py-2.5 rounded-lg text-sm font-medium">{t("Something is wrong")}</button>}
        </div>
        {problem !== null && (
          <div className="mt-3">
            <textarea rows={3} value={problem} onChange={(ev) => setProblem(ev.target.value)} aria-label={t("What is wrong?")} placeholder={t("What is wrong?")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <button onClick={() => post({ action: "problem", note: problem }, t("Thank you. The school has your note."))} disabled={busy || !problem.trim()} className="mt-2 border border-gray-200 text-dark px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">{t("Send to the school")}</button>
          </div>
        )}
      </>
    );
  };

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-xl mx-auto">
        <div className="flex justify-center mb-4"><SchoolCrest width={40} height={48} /></div>
        <div className="bg-white rounded-xl border border-gray-100 p-5">{body()}</div>
      </div>
    </main>
  );
}
