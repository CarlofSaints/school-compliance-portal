"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth, authFetch } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";
import { useBranding } from "@/components/BrandingProvider";
import { DEFAULT_POLICY_CATEGORIES, REQUIRED_POLICY_CATEGORY } from "@/lib/policyCategories";
import { POLICY_AI_CREDITS } from "@/lib/creditPack";
import { COMPLY_WITH, MAX_DESCRIPTION, MAX_INSTRUCTION, MAX_NAME } from "@/lib/policyCompileOptions";
import { PROVINCES } from "@/lib/trainingTopics";
import SchoolCrest from "@/components/SchoolCrest";
import { parseTranscript } from "@/lib/policyText";
import { policyDraftKey } from "@/lib/minutesBackupKeys";
import ComplianceScore from "@/components/ComplianceScore";
import RiskBadge from "@/components/RiskBadge";
import Toast from "@/components/Toast";

const input = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none";
const ghost = "px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50";
const solid = "bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50";

// The draft lives only in this browser until it is added to the register, so
// it is kept here too: a refresh or a dropped connection must not lose a
// policy somebody has spent half an hour shaping. Per site and per person,
// and cleared on sign-out (lib/minutesBackupKeys.ts), so the next person on a
// shared computer never finds it.

interface Form {
  name: string;
  description: string;
  comply: string[];
  province: string;
  guidelineIds: string[];
  category: string;
}
interface Check {
  score: number;
  summary: string;
  risks: { severity: "low" | "medium" | "high"; section: string; description: string; guideline_reference: string; suggestion: string }[];
}
type Busy = "" | "draft" | "revise" | "check" | "save";

const EMPTY: Form = { name: "", description: "", comply: ["sasa", "bela"], province: "Gauteng", guidelineIds: [], category: REQUIRED_POLICY_CATEGORY };

export default function CompilePolicyPage() {
  const t = useT();
  const branding = useBranding();
  const router = useRouter();
  const { session, loading } = useAuth("upload_policies");
  const [form, setForm] = useState<Form>(EMPTY);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [change, setChange] = useState("");
  const [check, setCheck] = useState<(Check & { of: string }) | null>(null);
  const [busy, setBusy] = useState<Busy>("");
  const [restored, setRestored] = useState(false);
  const [guidelines, setGuidelines] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_POLICY_CATEGORIES);
  const [credits, setCredits] = useState<{ balance: number; canSpend: boolean } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const backup = session ? policyDraftKey(window.location.host, session.id) : "";

  useEffect(() => {
    if (!backup) return;
    try {
      const saved = JSON.parse(localStorage.getItem(backup) || "null") as { form: Form; draft: string } | null;
      if (saved?.form) {
        setForm({ ...EMPTY, ...saved.form });
        setDraft(saved.draft || "");
      }
    } catch {
      // A damaged backup is simply not restored.
    }
    setRestored(true);
  }, [backup]);

  useEffect(() => {
    if (!restored || !backup) return;
    try {
      localStorage.setItem(backup, JSON.stringify({ form, draft }));
    } catch {
      // Storage full or blocked: the draft is still on screen.
    }
  }, [form, draft, restored, backup]);

  useEffect(() => {
    if (!session) return;
    authFetch("/api/policies/compile").then(async (r) => r.ok && setCredits(await r.json())).catch(() => {});
    authFetch("/api/guidelines").then(async (r) => r.ok && setGuidelines(await r.json())).catch(() => {});
    authFetch("/api/settings/policy-categories")
      .then(async (r) => {
        const data = r.ok ? await r.json() : null;
        if (Array.isArray(data) && data.length) setCategories(data);
      })
      .catch(() => {});
  }, [session]);

  const call = async (action: Exclude<Busy, "">, extra: Record<string, unknown> = {}) => {
    setBusy(action);
    try {
      const r = await authFetch("/api/policies/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...form, draft, ...extra }),
      });
      const body = await r.json().catch(() => ({}));
      if (typeof body.balance === "number") setCredits((c) => (c ? { ...c, balance: body.balance } : c));
      if (body.canSpend === false) setCredits((c) => (c ? { ...c, canSpend: false } : c));
      if (!r.ok) {
        setToast({ message: body.error || t("Something went wrong. Please try again."), type: "error" });
        return null;
      }
      return body;
    } catch {
      setToast({ message: t("Something went wrong. Please try again."), type: "error" });
      return null;
    } finally {
      setBusy("");
    }
  };

  const write = async (e: React.FormEvent) => {
    e.preventDefault();
    if (draft && !confirm(t("Write a new draft? The draft you have now will be replaced."))) return;
    const body = await call("draft");
    if (body?.draft) {
      setDraft(body.draft);
      setCheck(null);
      setEditing(false);
    }
  };

  const revise = async (text: string) => {
    const body = await call("revise", { change: text });
    if (body?.draft) {
      setDraft(body.draft);
      setChange("");
      setCheck(null);
      setToast({ message: t("Draft updated"), type: "success" });
    }
  };

  const runCheck = async () => {
    const body = await call("check");
    if (body) setCheck({ ...body, of: draft });
  };

  const save = async () => {
    const body = await call("save");
    if (body?.id) {
      localStorage.removeItem(backup);
      router.push(`/policies/${body.id}`);
    }
  };

  const startOver = () => {
    if (!confirm(t("Start over? The form and the draft will be cleared."))) return;
    setForm(EMPTY);
    setDraft("");
    setCheck(null);
    setEditing(false);
  };

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const fixIssues = () =>
    check &&
    revise(
      "Fix these issues found by the compliance check:\n" +
        check.risks.map((r) => `- ${r.section}: ${r.description} (${r.guideline_reference}). ${r.suggestion}`).join("\n")
    );

  const stale = check !== null && check.of !== draft;
  if (loading || !restored) return <div className="p-6">{t("Loading...")}</div>;
  const working = busy !== "";
  // Each AI step is paid in the school's credits. Until the balance has loaded nothing is blocked: the server decides.
  const price = POLICY_AI_CREDITS;
  const affordable = (n: number) => !credits || (credits.canSpend && credits.balance >= n);
  const cost = (n: number) => (n === 1 ? t("{n} credit", { n }) : t("{n} credits", { n }));

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("Compile a policy from scratch")}</h1>
          <p className="text-gray-500 text-sm">{t("For a policy your school does not have yet. Describe it, choose what it must comply with, and the AI writes a first draft for you to review.")}</p>
        </div>
        <Link href="/policies" className={ghost}>{t("Back to Policies")}</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <form onSubmit={write} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4 self-start">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("Policy Name")}</label>
            <input required maxLength={MAX_NAME} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("e.g. Learner Cellphone Policy")} className={input} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("Describe the policy you need")}</label>
            <textarea
              required
              rows={6}
              maxLength={MAX_DESCRIPTION}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={t("What it should cover, who it applies to, and anything your school already does that it must include.")}
              className={`${input} resize-y`}
            />
          </div>
          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 mb-2">{t("It must comply with")}</legend>
            <div className="space-y-1.5">
              {COMPLY_WITH.map((c) => (
                <label key={c.key} className="flex items-start gap-2 text-sm text-gray-700">
                  <input type="checkbox" className="mt-0.5" checked={form.comply.includes(c.key)} onChange={() => setForm({ ...form, comply: toggle(form.comply, c.key) })} />
                  <span>{c.key === "provincial" ? t("Provincial education department guidelines") : c.label}</span>
                </label>
              ))}
              {form.comply.includes("provincial") && (
                <select value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} className={`${input} ml-6 w-auto`} aria-label={t("Province")}>
                  {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              )}
            </div>
          </fieldset>
          {guidelines.length > 0 && (
            <fieldset>
              <legend className="block text-sm font-medium text-gray-700 mb-1">{t("Your school's uploaded guidelines (up to 5)")}</legend>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {guidelines.map((g) => (
                  <label key={g.id} className="flex items-start gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={form.guidelineIds.includes(g.id)}
                      disabled={!form.guidelineIds.includes(g.id) && form.guidelineIds.length >= 5}
                      onChange={() => setForm({ ...form, guidelineIds: toggle(form.guidelineIds, g.id) })}
                    />
                    <span>{g.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("Category")}</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={input}>
              {[...new Set([form.category, ...categories])].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            <button type="submit" disabled={working || !affordable(price.draft)} className={solid}>
              {busy === "draft" ? t("Writing the policy... this takes a minute or two") : `${draft ? t("Write a new draft") : t("Write the draft")} (${cost(price.draft)})`}
            </button>
            {(draft || form.name) && (
              <button type="button" onClick={startOver} disabled={working} className={ghost}>{t("Start over")}</button>
            )}
          </div>
        </form>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
            <div>
              <p className="font-medium text-dark">{credits ? (credits.balance === 1 ? t("Your school has {n} credit", { n: 1 }) : t("Your school has {n} credits", { n: credits.balance })) : t("Loading...")}</p>
              <p className="text-xs text-gray-500">
                {t("The AI is paid for in credits: a draft uses {a}, each change {b}, a compliance check {c}. Editing the text yourself and adding to the library are free.", { a: price.draft, b: price.revise, c: price.check })}
              </p>
              {credits && !credits.canSpend && (
                <p className="text-xs text-amber-700 mt-1">{t("You are not allowed to spend the school's credits. Ask your administrator to tick \"Can spend translation credits\" on your user.")}</p>
              )}
            </div>
            {session?.permissions.includes("manage_users") ? (
              <Link href="/admin/translation-credits" className={solid}>{t("Buy credits")}</Link>
            ) : (
              <span className="text-xs text-gray-500">{t("To buy credits, ask your administrator (Admin > Translation Credits).")}</span>
            )}
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900 space-y-1">
            <p><strong>{t("Not a legal review.")}</strong> {t("A draft is a starting point. The SGB or board of governors should read it before adopting it.")}</p>
            <p><strong>{t("The compliance check here is not saved.")}</strong> {t("It checks the draft only. Once the policy is in your library, run the check again on its policy page so the score is kept.")}</p>
          </div>
          {!draft ? (
            <div className="bg-white rounded-xl shadow-sm border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400">
              {t("The draft appears here, on your school's letterhead.")}
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-6 py-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-amber-600">{t("Draft, not yet in your register")}</span>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setEditing(!editing)} disabled={working} className={ghost}>
                      {editing ? t("Done editing") : t("Edit the text myself")}
                    </button>
                    <button type="button" onClick={runCheck} disabled={working || !session?.permissions.includes("check_compliance") || !affordable(price.check)} className={ghost}>
                      {busy === "check" ? t("Checking...") : `${t("Run Compliance Check")} (${cost(price.check)})`}
                    </button>
                    <button type="button" onClick={save} disabled={working} className={solid}>
                      {busy === "save" ? t("Adding...") : t("Add to policy library")}
                    </button>
                  </div>
                </div>
                {editing ? (
                  <textarea value={draft} readOnly={working} onChange={(e) => setDraft(e.target.value)} rows={30} className="w-full p-6 font-mono text-xs outline-none resize-y" aria-label={t("Policy text")} />
                ) : (
                  <div className="p-8">
                    <div className="flex flex-col items-center gap-2 mb-6 border-b border-gray-100 pb-6">
                      <SchoolCrest width={72} height={72} />
                      <p className="font-bold text-dark">{branding.fullName}</p>
                    </div>
                    {/* The same parser as the Word file, so clause numbers and headings read exactly as they will be saved. */}
                    <div className="text-sm text-gray-800 leading-relaxed">
                      {parseTranscript(draft).map((l, i) =>
                        l.kind === "h1" ? (
                          <h2 key={i} className="text-lg font-semibold text-dark mt-5 mb-2">{l.text}</h2>
                        ) : l.kind === "h2" ? (
                          <h3 key={i} className="text-base font-semibold text-dark mt-4 mb-1.5">{l.text}</h3>
                        ) : l.kind === "bullet" ? (
                          <p key={i} className="my-1 pl-5 relative before:content-['•'] before:absolute before:left-1">{l.text}</p>
                        ) : (
                          <p key={i} className="my-2">{l.text}</p>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("Ask the AI to change or add something")}</label>
                <textarea
                  rows={3}
                  maxLength={MAX_INSTRUCTION}
                  value={change}
                  onChange={(e) => setChange(e.target.value)}
                  placeholder={t("e.g. Add a section on phones during exams, and make the confiscation period 24 hours.")}
                  className={`${input} resize-y`}
                />
                <button type="button" onClick={() => revise(change.trim())} disabled={working || !change.trim() || !affordable(price.revise)} className={`${solid} mt-3`}>
                  {busy === "revise" ? t("Rewriting the draft...") : `${t("Make the change")} (${cost(price.revise)})`}
                </button>
              </div>

              {check && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <ComplianceScore score={check.score} size="sm" />
                    <p className="text-sm text-gray-600 flex-1">{check.summary}</p>
                  </div>
                  <div className="space-y-3">
                    {check.risks.map((risk, i) => (
                      <div key={i} className="border border-gray-100 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <RiskBadge severity={risk.severity} />
                          <span className="text-sm font-medium">{risk.section}</span>
                        </div>
                        <p className="text-sm text-gray-600">{risk.description}</p>
                        <p className="text-xs text-gray-400 mt-2">{t("Reference:")} {risk.guideline_reference}</p>
                        <p className="text-xs text-primary mt-1">{t("Suggestion:")} {risk.suggestion}</p>
                      </div>
                    ))}
                    {check.risks.length === 0 && <p className="text-sm text-emerald-600">{t("No compliance risks found.")}</p>}
                  </div>
                  {stale && <p className="text-xs text-amber-600 mt-3">{t("The draft has changed since this check. Run it again to see where it stands now.")}</p>}
                  {check.risks.length > 0 && !stale && (
                    <button type="button" onClick={fixIssues} disabled={working || !affordable(price.revise)} className={`${solid} mt-4`}>
                      {busy === "revise" ? t("Rewriting the draft...") : `${t("Fix these in the draft")} (${cost(price.revise)})`}
                    </button>
                  )}
                  <p className="text-xs text-amber-700 mt-3">{t("This check is of the draft and is not saved. Run the check again on the policy page once it is in your library.")}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
