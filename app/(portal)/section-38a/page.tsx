"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth, authFetch, apiErrorMessage } from "@/lib/useAuth";
import Toast from "@/components/Toast";
import FileUpload from "@/components/FileUpload";
import DownloadLink from "@/components/DownloadLink";
import { useT } from "@/components/I18nProvider";
import { useBranding } from "@/components/BrandingProvider";
import {
  ACTIVITIES,
  BENEFITS,
  EMPLOYEE_STATUS,
  PAYS,
  SOURCES,
  STEPS,
  TIMES,
  yearMax,
  type ClientYear,
  type EmployeeStatus,
  type Overview,
} from "@/lib/section38a";

// One budget year's application, top to bottom in the order the work happens.
// The wording and steps come from the draft national Form 1; expect them to
// change once a real Gauteng application has been seen.

interface Data {
  year: ClientYear;
  overview: Overview;
  tags: { id: string; name: string }[];
  policies: { id: string; name: string }[];
  people: { id: string; name: string; email: string }[];
}
type Setup = Pick<ClientYear, "budgetDate" | "province" | "district" | "emis" | "budgetLine" | "sources" | "policyId" | "sgbTagId" | "financeTagId" | "approval">;
type Person = Omit<ClientYear["people"][number], "id" | "link" | "signature" | "problem" | "decision" | "status" | "max"> & { stateNotPaying: boolean; noInterference: boolean; coreActivity: boolean };

const PROVINCES = ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape"];
const BLANK: Person = {
  name: "", surname: "", email: "", persal: "", rank: "", benefit: "remuneration", activities: [], description: "", times: [], timesOther: "",
  pay: "monthly", amount: 0, hours: 0, details: "", stateNotPaying: false, noInterference: false, coreActivity: false,
};
const STATUS_LOOK: Record<EmployeeStatus, string> = {
  not_sent: "bg-gray-100 text-gray-600",
  sent: "bg-amber-50 text-amber-700",
  signed: "bg-green-100 text-green-800",
  changed: "bg-orange-100 text-orange-800",
  problem: "bg-red-100 text-red-700",
};
const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const labelCls = "block text-xs font-medium text-gray-600 mb-1";
const cardCls = "bg-white rounded-xl border border-gray-100 p-5 mb-5";
const mainBtn = "bg-primary hover:bg-primary-dark disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium";
const altBtn = "border border-gray-200 hover:border-primary text-dark px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50";
const rand = (n: number) => `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const longDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-ZA", { dateStyle: "long" });

function Chips<K extends string>({ options, value, onChange }: { options: Record<K, string>; value: K[]; onChange: (v: K[]) => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-3">
      {(Object.keys(options) as K[]).map((k) => (
        <label key={k} className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={value.includes(k)} onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((x) => x !== k))} />
          {t(options[k])}
        </label>
      ))}
    </div>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="text-xl font-bold text-dark">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

export default function Section38aPage() {
  const t = useT();
  const branding = useBranding();
  const { session, loading } = useAuth("manage_section_38a");
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear + 1);
  const [data, setData] = useState<Data | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; person: Person } | null>(null);
  const [lodge, setLodge] = useState({ date: "", how: "", reference: "" });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // The forms seed once per year, never on a refresh: a refresh must not wipe what someone is typing.
  const load = useCallback(async (seed: boolean) => {
    const res = await authFetch(`/api/section-38a/${year}`);
    if (!res.ok) return setToast({ message: await apiErrorMessage(res), type: "error" });
    const d: Data = await res.json();
    setData(d);
    if (seed) {
      const { budgetDate, province, district, emis, budgetLine, sources, policyId, sgbTagId, financeTagId, approval } = d.year;
      setSetup({ budgetDate, province, district, emis, budgetLine, sources, policyId, sgbTagId, financeTagId, approval });
    }
  }, [year]);
  useEffect(() => {
    if (session) load(true);
  }, [session, load]);

  const act = async (url: string, init: RequestInit, done?: string): Promise<boolean> => {
    setBusy(true);
    const res = await authFetch(url, init);
    setBusy(false);
    if (!res.ok) {
      setToast({ message: await apiErrorMessage(res), type: "error" });
      return false;
    }
    if (done) setToast({ message: done, type: "success" });
    return true;
  };
  const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const base = `/api/section-38a/${year}`;

  const saveSetup = async (quiet = false) => {
    const ok = await act(base, json("PUT", setup), quiet ? undefined : t("Saved."));
    if (ok) await load(false);
    return ok;
  };
  const send = async (target: string, chair = false) => {
    // The undertaking is built from what is saved, so what is on screen is saved first.
    if (chair && !(await saveSetup(true))) return;
    if (await act(`${base}/send`, json("POST", { target }), t("Sent."))) await load(false);
  };
  const savePerson = async () => {
    if (!editing) return;
    const ok = await act(editing.id ? `${base}/people/${editing.id}` : `${base}/people`, json(editing.id ? "PUT" : "POST", editing.person), t("Saved."));
    if (ok) {
      setEditing(null);
      await load(false);
    }
  };
  const upload = async (kind: "proof" | "letter", file: File) => {
    const form = new FormData();
    form.append("file", file);
    if (await act(`${base}/file?kind=${kind}`, { method: "POST", body: form }, t("Saved."))) await load(false);
  };

  if (loading || !session) return null;
  if (branding.schoolType === "private") return <p className="text-gray-600">{t("Section 38A applies to public schools only.")}</p>;

  const o = data?.overview;
  const y = data?.year;
  const locked = !!y?.lodged;
  const up = <K extends keyof Setup>(k: K, v: Setup[K]) => setSetup((s) => s && { ...s, [k]: v });
  const upA = (v: Partial<Setup["approval"]>) => setSetup((s) => s && { ...s, approval: { ...s.approval, ...v } });
  const p = editing?.person;
  const upP = (v: Partial<Person>) => setEditing((e) => e && { ...e, person: { ...e.person, ...v } });

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("Section 38A")}</h1>
          <p className="text-sm text-gray-500">{t("Permission to pay state-paid staff extra, one budget year at a time.")}</p>
        </div>
        <label className="text-sm text-gray-600">
          {t("Budget year")}{" "}
          <select value={year} onChange={(e) => { setData(null); setSetup(null); setYear(Number(e.target.value)); }} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
            {[thisYear - 1, thisYear, thisYear + 1, thisYear + 2].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
      </div>

      {!y || !o || !setup ? (
        <p className="text-gray-500">{t("Loading...")}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1 mb-4">
            {STEPS.map((s, i) => (
              <span key={s} className={`flex-1 min-w-24 px-2 py-1.5 rounded text-xs ${i < o.step ? "bg-green-100 text-green-800" : i === o.step ? "bg-primary text-white font-semibold" : "bg-gray-100 text-gray-500"}`}>{t(s)}</span>
            ))}
          </div>

          <div className="bg-amber-50 text-amber-800 rounded-lg px-4 py-3 text-sm mb-3">
            {t("This uses the draft national Form 1 (6 August 2026), which is not final. Check with your district what it accepts before you lodge.")}
          </div>
          {!locked && (
            <div className={`rounded-lg px-4 py-3 text-sm mb-3 ${o.late ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-700"}`}>
              {o.late
                ? t("The lodging date of {date} has passed. Section 38A(4) needs at least four months before your budget is finalised.", { date: longDate(o.lodgeBy) })
                : t("Lodge by {date}: {n} days left. Section 38A(4) needs at least four months before your budget is finalised.", { date: longDate(o.lodgeBy), n: o.daysToLodge })}
            </div>
          )}
          {o.overBudget && y.budgetLine > 0 && <div className="bg-amber-50 text-amber-800 rounded-lg px-4 py-3 text-sm mb-3">{t("The list comes to more than the budget line. Tax must fit in that line too.")}</div>}
          {o.wordsToCheck.map((w) => (
            <div key={w.name} className="bg-amber-50 text-amber-800 rounded-lg px-4 py-3 text-sm mb-3">{t("{name}: the words mention \"{word}\". Bonuses, gratuities and fee exemptions may not be applied for, so check this is not one.", w)}</div>
          ))}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <Tile value={String(o.people)} label={t("people on the list")} />
            <Tile value={t("{n} of {total}", { n: o.signed, total: o.people })} label={t("employees signed")} />
            <Tile value={rand(o.total)} label={t("of {budget} budget", { budget: rand(y.budgetLine) })} />
            <Tile value={t("{n} of {total}", { n: o.approved, total: o.people })} label={t("approved so far")} />
          </div>

          <section className={cardCls}>
            <h2 className="text-sm font-semibold text-dark mb-3">{t("1. Setup")}</h2>
            <fieldset disabled={locked} className="grid md:grid-cols-3 gap-3">
              <label><span className={labelCls}>{t("Date the budget is finalised")} *</span><input type="date" value={setup.budgetDate} onChange={(e) => up("budgetDate", e.target.value)} className={inputCls} /></label>
              <label><span className={labelCls}>{t("Province")} *</span>
                <select value={setup.province} onChange={(e) => up("province", e.target.value)} className={inputCls}>
                  <option value="">{t("Choose...")}</option>
                  {PROVINCES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <label><span className={labelCls}>{t("District")} *</span><input value={setup.district} onChange={(e) => up("district", e.target.value)} className={inputCls} /></label>
              <label><span className={labelCls}>{t("EMIS number")} *</span><input value={setup.emis} onChange={(e) => up("emis", e.target.value)} className={inputCls} /></label>
              <label><span className={labelCls}>{t("Budget line for 38A, tax included")} *</span><input type="number" min="0" step="0.01" value={setup.budgetLine || ""} onChange={(e) => up("budgetLine", Number(e.target.value))} className={inputCls} /></label>
              <label><span className={labelCls}>{t("Section 38A policy")} *</span>
                <select value={setup.policyId} onChange={(e) => up("policyId", e.target.value)} className={inputCls}>
                  <option value="">{t("Choose...")}</option>
                  {data.policies.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </label>
              <label><span className={labelCls}>{t("Tag of the SGB chairperson")}</span>
                <select value={setup.sgbTagId} onChange={(e) => up("sgbTagId", e.target.value)} className={inputCls}>
                  <option value="">{t("Choose...")}</option>
                  {data.tags.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </label>
              <label><span className={labelCls}>{t("Tag of the finance committee chairperson")}</span>
                <select value={setup.financeTagId} onChange={(e) => up("financeTagId", e.target.value)} className={inputCls}>
                  <option value="">{t("Choose...")}</option>
                  {data.tags.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </label>
              <div className="md:col-span-3">
                <span className={labelCls}>{t("Where the money comes from")} *</span>
                <Chips options={SOURCES} value={setup.sources} onChange={(v) => up("sources", v)} />
              </div>
            </fieldset>
            {!locked && <div className="flex justify-end mt-3"><button onClick={() => saveSetup()} disabled={busy} className={mainBtn}>{t("Save setup")}</button></div>}
          </section>

          <section className={cardCls}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold text-dark">{t("2. People and signatures")}</h2>
              {!locked && (
                <div className="flex gap-2">
                  {!y.people.length && <button onClick={async () => { if (await act(`${base}/copy`, { method: "POST" }, t("Saved."))) await load(true); }} disabled={busy} className={altBtn}>{t("Copy last year's list")}</button>}
                  <button onClick={() => setEditing({ id: null, person: BLANK })} className={mainBtn}>{t("Add a person")}</button>
                </div>
              )}
            </div>
            {y.people.length === 0 ? (
              <p className="text-sm text-gray-500">{t("Nobody on the list yet.")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-100">
                      <th className="py-2 pr-3 font-medium">{t("Person")}</th>
                      <th className="py-2 pr-3 font-medium">{t("Rank")}</th>
                      <th className="py-2 pr-3 font-medium">{t("Duties")}</th>
                      <th className="py-2 pr-3 font-medium text-right">{t("Year maximum")}</th>
                      <th className="py-2 pr-3 font-medium">{t("Employee")}</th>
                      <th className="py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {y.people.map((e) => (
                      <tr key={e.id} className="border-b border-gray-50 align-top">
                        <td className="py-2 pr-3">{e.name} {e.surname}<div className="text-xs text-gray-500">{e.persal}</div></td>
                        <td className="py-2 pr-3">{e.rank}</td>
                        <td className="py-2 pr-3">{e.description}{e.problem && <div className="text-xs text-red-700 mt-1">{e.problem.note}</div>}</td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap">{rand(e.max)}</td>
                        <td className="py-2 pr-3"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_LOOK[e.status]}`}>{t(EMPLOYEE_STATUS[e.status])}</span></td>
                        <td className="py-2 whitespace-nowrap text-right">
                          {!locked && (
                            <>
                              {e.status !== "signed" && <button onClick={() => send(e.id)} disabled={busy} className="text-primary hover:underline text-xs mr-3">{e.link ? t("Send again") : t("Send to sign")}</button>}
                              <button onClick={() => setEditing({ id: e.id, person: { name: e.name, surname: e.surname, email: e.email, persal: e.persal, rank: e.rank, benefit: e.benefit, activities: e.activities, description: e.description, times: e.times, timesOther: e.timesOther, pay: e.pay, amount: e.amount, hours: e.hours, details: e.details, stateNotPaying: true, noInterference: true, coreActivity: true } })} className="text-primary hover:underline text-xs mr-3">{t("Edit")}</button>
                              <button onClick={async () => { if (await act(`${base}/people/${e.id}`, { method: "DELETE" }, t("Saved."))) await load(false); }} disabled={busy} className="text-red-600 hover:underline text-xs">{t("Remove")}</button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={cardCls}>
            <h2 className="text-sm font-semibold text-dark mb-3">{t("3. SGB approval")}</h2>
            <fieldset disabled={locked} className="space-y-3">
              <div className="grid md:grid-cols-3 gap-3">
                <label><span className={labelCls}>{t("SGB meeting date")} *</span><input type="date" value={setup.approval.meetingDate} onChange={(e) => upA({ meetingDate: e.target.value })} className={inputCls} /></label>
                <label className="md:col-span-2"><span className={labelCls}>{t("Minutes item")} *</span><input value={setup.approval.item} onChange={(e) => upA({ item: e.target.value })} placeholder={t("For example: item 6, section 38A applications")} className={inputCls} /></label>
              </div>
              <label className="block"><span className={labelCls}>{t("Who stepped out for this item (staff on the SGB who are on this list)")}</span><input value={setup.approval.steppedOut} onChange={(e) => upA({ steppedOut: e.target.value })} className={inputCls} /></label>
              <label className="flex gap-2 text-sm"><input type="checkbox" checked={setup.approval.sections20} onChange={(e) => upA({ sections20: e.target.checked })} />{t("SGB-employed staff comply with sections 20(5) to (9).")}</label>
              <label className="flex gap-2 text-sm"><input type="checkbox" checked={setup.approval.funds} onChange={(e) => upA({ funds: e.target.checked })} />{t("None of this comes from the state allocation, and the budget includes tax.")}</label>
              <label className="flex gap-2 text-sm"><input type="checkbox" checked={setup.approval.affordable} onChange={(e) => upA({ affordable: e.target.checked })} />{t("The school's assets will exceed its liabilities after these payments.")}</label>
            </fieldset>
            {!locked && <div className="flex justify-end mt-3"><button onClick={() => saveSetup()} disabled={busy} className={mainBtn}>{t("Save approval")}</button></div>}
            <div className="mt-4 border-t border-gray-100 pt-3 text-sm space-y-2">
              {(["sgb", "finance"] as const).map((line) => {
                const c = y.chairs[line];
                return (
                  <div key={line} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-medium">{line === "sgb" ? t("SGB chairperson") : t("Finance committee chairperson")}</span>
                      {c && <span className="text-gray-500"> {c.name}: {c.signed ? t("Signed") : c.signature ? t("Changed after signing") : t("Waiting to sign")}</span>}
                    </span>
                    {!locked && !c?.signed && <button onClick={() => send(line, true)} disabled={busy} className="text-primary hover:underline text-xs">{c ? t("Send again") : t("Send to sign")}</button>}
                  </div>
                );
              })}
            </div>
          </section>

          <section className={cardCls}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold text-dark">{t("4. Build and lodge")}</h2>
              {y.people.length > 0 && <DownloadLink href={`${base}/pack`} filename={`Section 38A application ${year}.pdf`} onError={(m) => setToast({ message: m, type: "error" })} className="text-primary hover:underline text-sm">{t("Download pack")}</DownloadLink>}
            </div>
            {y.lodged ? (
              <div className="text-sm space-y-2">
                <p>{t("Lodged on {date}. {how} {reference}", { date: longDate(y.lodged.date), how: y.lodged.how, reference: y.lodged.reference })}</p>
                {y.lodged.proof ? (
                  <DownloadLink href={`${base}/file?kind=proof`} filename={y.lodged.proof.name} className="text-primary hover:underline">{y.lodged.proof.name}</DownloadLink>
                ) : (
                  <FileUpload accept=".pdf,.png,.jpg,.jpeg" label={t("Upload proof of lodging")} onChange={(f) => upload("proof", f)} />
                )}
                <button onClick={async () => { if (await act(`${base}/lodge`, { method: "DELETE" }, t("Saved."))) await load(false); }} disabled={busy} className="text-red-600 hover:underline text-xs block">{t("Undo lodgement")}</button>
              </div>
            ) : (
              <>
                {o.gaps.length > 0 && <p className="text-sm text-gray-600 mb-3">{t("Still needed:")} {o.gaps.map((g) => t(g)).join(", ")}</p>}
                <div className="grid md:grid-cols-3 gap-3">
                  <label><span className={labelCls}>{t("Date lodged")} *</span><input type="date" value={lodge.date} onChange={(e) => setLodge({ ...lodge, date: e.target.value })} className={inputCls} /></label>
                  <label><span className={labelCls}>{t("How")}</span><input value={lodge.how} onChange={(e) => setLodge({ ...lodge, how: e.target.value })} placeholder={t("For example: hand delivered to the district")} className={inputCls} /></label>
                  <label><span className={labelCls}>{t("Reference")}</span><input value={lodge.reference} onChange={(e) => setLodge({ ...lodge, reference: e.target.value })} className={inputCls} /></label>
                </div>
                <div className="flex justify-end mt-3">
                  <button onClick={async () => { if (await act(`${base}/lodge`, json("POST", lodge), t("Saved."))) await load(false); }} disabled={busy || o.gaps.length > 0 || !lodge.date} className={mainBtn}>{t("Mark as lodged")}</button>
                </div>
              </>
            )}
          </section>

          {y.lodged && o.decisionDue && (
            <section className={cardCls}>
              <h2 className="text-sm font-semibold text-dark mb-1">{t("5. Decision")}</h2>
              <p className="text-sm text-gray-600 mb-3">{t("The Head of Department has until {date}. After that, or if refused, you may appeal to the MEC.", { date: longDate(o.decisionDue) })}</p>
              {y.letter ? (
                <DownloadLink href={`${base}/file?kind=letter`} filename={y.letter.name} className="text-primary hover:underline text-sm">{y.letter.name}</DownloadLink>
              ) : (
                <FileUpload accept=".pdf,.png,.jpg,.jpeg" label={t("Upload the Head of Department's letter")} onChange={(f) => upload("letter", f)} />
              )}
              {y.letter && (
                <ul className="mt-3 text-sm divide-y divide-gray-50">
                  {y.people.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>{e.name} {e.surname} <span className="text-gray-500">{rand(e.max)}</span></span>
                      <select aria-label={t("Decision")} value={e.decision ?? ""} disabled={busy} onChange={async (ev) => { if (await act(`${base}/decision`, json("PUT", { id: e.id, decision: ev.target.value || null }))) await load(false); }} className="border border-gray-300 rounded-lg px-2 py-1 text-sm">
                        <option value="">{t("Not decided")}</option>
                        <option value="approved">{t("Approved")}</option>
                        <option value="refused">{t("Refused")}</option>
                      </select>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      {p && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg font-semibold text-dark mb-4">{editing?.id ? t("Edit person") : t("Add a person")}</h2>
            <div className="grid md:grid-cols-2 gap-3">
              {!editing?.id && !!data?.people.length && (
                <label className="md:col-span-2"><span className={labelCls}>{t("Choose from People")}</span>
                  <select defaultValue="" onChange={(e) => {
                    const hit = data.people.find((x) => x.id === e.target.value);
                    if (!hit) return;
                    const parts = hit.name.trim().split(/\s+/);
                    upP({ name: parts.slice(0, -1).join(" ") || hit.name, surname: parts.length > 1 ? parts[parts.length - 1] : "", email: hit.email });
                  }} className={inputCls}>
                    <option value="">{t("Choose...")}</option>
                    {data.people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </label>
              )}
              <label><span className={labelCls}>{t("First names")} *</span><input value={p.name} onChange={(e) => upP({ name: e.target.value })} className={inputCls} /></label>
              <label><span className={labelCls}>{t("Surname")} *</span><input value={p.surname} onChange={(e) => upP({ surname: e.target.value })} className={inputCls} /></label>
              <label><span className={labelCls}>{t("Email")} *</span><input type="email" value={p.email} onChange={(e) => upP({ email: e.target.value })} className={inputCls} /></label>
              <label><span className={labelCls}>{t("PERSAL number")} *</span><input inputMode="numeric" value={p.persal} onChange={(e) => upP({ persal: e.target.value })} className={inputCls} /></label>
              <label><span className={labelCls}>{t("Rank")} *</span><input value={p.rank} onChange={(e) => upP({ rank: e.target.value })} className={inputCls} /></label>
              <label><span className={labelCls}>{t("Type of payment")} *</span>
                <select value={p.benefit} onChange={(e) => upP({ benefit: e.target.value as Person["benefit"] })} className={inputCls}>
                  {(Object.keys(BENEFITS) as Person["benefit"][]).map((k) => <option key={k} value={k}>{t(BENEFITS[k])}</option>)}
                </select>
              </label>
              <div className="md:col-span-2"><span className={labelCls}>{t("Activities")} *</span><Chips options={ACTIVITIES} value={p.activities} onChange={(v) => upP({ activities: v })} /></div>
              <label className="md:col-span-2"><span className={labelCls}>{t("What will they do? Up to 30 words")} *</span><textarea rows={2} value={p.description} onChange={(e) => upP({ description: e.target.value })} className={inputCls} /></label>
              <div className="md:col-span-2"><span className={labelCls}>{t("When is the work done?")} *</span><Chips options={TIMES} value={p.times} onChange={(v) => upP({ times: v })} /></div>
              {p.times.includes("other") && <label className="md:col-span-2"><span className={labelCls}>{t("Other time, up to 20 words")} *</span><input value={p.timesOther} onChange={(e) => upP({ timesOther: e.target.value })} className={inputCls} /></label>}
              <label><span className={labelCls}>{t("Paid")} *</span>
                <select value={p.pay} onChange={(e) => upP({ pay: e.target.value as Person["pay"] })} className={inputCls}>
                  {(Object.keys(PAYS) as Person["pay"][]).map((k) => <option key={k} value={k}>{t(PAYS[k])}</option>)}
                </select>
              </label>
              <label><span className={labelCls}>{t("Amount in rand")} *</span><input type="number" min="0" step="0.01" value={p.amount || ""} onChange={(e) => upP({ amount: Number(e.target.value) })} className={inputCls} /></label>
              {p.pay === "hourly" && <label><span className={labelCls}>{t("Hours in the year")} *</span><input type="number" min="0" value={p.hours || ""} onChange={(e) => upP({ hours: Number(e.target.value) })} className={inputCls} /></label>}
              <p className="md:col-span-2 text-sm text-gray-600">{t("Year maximum")}: <strong>{rand(yearMax(p))}</strong></p>
              <label className="md:col-span-2"><span className={labelCls}>{t("Full details of the extent of the payment")}</span><textarea rows={2} value={p.details} onChange={(e) => upP({ details: e.target.value })} className={inputCls} /></label>
              <div className="md:col-span-2 space-y-1">
                <span className={labelCls}>{t("The SGB confirms")} *</span>
                <label className="flex gap-2 text-sm"><input type="checkbox" checked={p.stateNotPaying} onChange={(e) => upP({ stateNotPaying: e.target.checked })} />{t("The state does not already pay for this work.")}</label>
                <label className="flex gap-2 text-sm"><input type="checkbox" checked={p.noInterference} onChange={(e) => upP({ noInterference: e.target.checked })} />{t("It will not interfere with their normal duties.")}</label>
                <label className="flex gap-2 text-sm"><input type="checkbox" checked={p.coreActivity} onChange={(e) => upP({ coreActivity: e.target.checked })} />{t("It supports the core activities of the school.")}</label>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">{t("Cancel")}</button>
              <button onClick={savePerson} disabled={busy} className={mainBtn}>{t("Save")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
