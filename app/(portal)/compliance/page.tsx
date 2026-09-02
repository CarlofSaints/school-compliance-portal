"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import FileUpload from "@/components/FileUpload";
import ComplianceScore from "@/components/ComplianceScore";
import ScoreNote from "@/components/ScoreNote";
import RiskBadge from "@/components/RiskBadge";
import Toast from "@/components/Toast";
import { branding } from "@/lib/branding";

interface PolicyOption {
  id: string;
  name: string;
}

// The check whose result is on screen. policyId is null while the document is
// only a document: that is the state the "Add to Policies" control exists for.
interface LoadedCheck {
  id: string;
  name: string;
  filename: string;
  policyId: string | null;
}

type RiskStatus = "not_an_issue" | "needs_addressing" | "in_progress" | "addressed";

interface CheckResult {
  score: number;
  summary: string;
  risks: {
    severity: "low" | "medium" | "high";
    section: string;
    description: string;
    guideline_reference: string;
    suggestion: string;
    status?: RiskStatus;
  }[];
  sources?: { title: string; url: string }[];
}

// Order/labels/colours for the per-issue workflow status controls + summary.
const STATUS_META: {
  key: RiskStatus;
  label: string;
  active: string;
  text: string;
}[] = [
  { key: "needs_addressing", label: "Needs to be addressed", active: "bg-risk-high border-risk-high text-white", text: "text-risk-high" },
  { key: "in_progress", label: "In progress", active: "bg-amber-500 border-amber-500 text-white", text: "text-amber-600" },
  { key: "addressed", label: "Has been addressed in new policy", active: "bg-emerald-500 border-emerald-500 text-white", text: "text-emerald-600" },
  { key: "not_an_issue", label: `Not an issue for ${branding.shortName}`, active: "bg-gray-500 border-gray-500 text-white", text: "text-gray-600" },
];

export default function CompliancePage() {
  const { session, loading } = useAuth("check_compliance");
  const [mode, setMode] = useState<"upload" | "existing">("upload");
  const [policies, setPolicies] = useState<PolicyOption[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loadedCheck, setLoadedCheck] = useState<LoadedCheck | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteName, setPromoteName] = useState("");
  const [promoteCategory, setPromoteCategory] = useState("General");
  const [promoting, setPromoting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  // True when the result on screen is a saved one rather than a fresh run. It
  // is what the "Check again" button hangs off: without a way to ask for a new
  // opinion, reusing the saved result would be a trap rather than a feature.
  const [wasReused, setWasReused] = useState(false);

  const fetchPolicies = useCallback(async () => {
    const res = await authFetch("/api/policies");
    if (res.ok) setPolicies(await res.json());
  }, []);

  // Needed only by the "Add to Policies" form, but fetched up front so the
  // category list is already there when someone opens it.
  const fetchCategories = useCallback(async () => {
    const res = await authFetch("/api/settings/policy-categories");
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) {
        setCategories(list);
        setPromoteCategory((c) => (list.includes(c) ? c : list[0]));
      }
    }
  }, []);

  useEffect(() => {
    if (session) {
      fetchPolicies();
      fetchCategories();
    }
  }, [session, fetchPolicies, fetchCategories]);

  // When opened from the dashboard with ?check=<id>, re-load that saved check
  // and show its results exactly as if it had just been run.
  useEffect(() => {
    if (!session) return;
    const checkId = new URLSearchParams(window.location.search).get("check");
    if (!checkId) return;
    (async () => {
      const res = await authFetch(`/api/compliance/checks/${checkId}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setResult({ score: data.score, summary: data.summary, risks: data.risks, sources: data.sources });
        setLoadedCheck({
          id: data.id,
          name: data.name,
          filename: data.filename,
          policyId: data.policyId ?? null,
        });
        setName(data.name);
      } else {
        setToast({ message: "Could not load saved check.", type: "error" });
      }
    })();
  }, [session]);

  // Choosing a file owns the Document Name and clears the previous document’s
  // result. Neither used to happen, so the name left over from the last check
  // was carried into the next one — and DOCUMENT NAME goes into the AI prompt,
  // so an admissions policy submitted under "2026 LANGUAGE POLICY.pdf" was
  // marked down for being "fundamentally mislabeled". The stale result sitting
  // beside the newly chosen file is what made it look like the wrong document
  // was being checked. Type a custom name AFTER picking the file; picking
  // another file resets it, because a name must not outlive the file it names.
  const pickFile = (picked: File) => {
    setFile(picked);
    setName(picked.name);
    setResult(null);
    setLoadedCheck(null);
    setPromoteOpen(false);
    setWasReused(false);
  };

  const runNew = () => {
    setResult(null);
    setLoadedCheck(null);
    setWasReused(false);
    setFile(null);
    setName("");
    setSelectedPolicy("");
    setMode("upload");
    setPromoteOpen(false);
    setToast(null);
    // Drop ?check=<id> so the load-saved-check effect doesn't re-fire.
    if (window.location.search) {
      window.history.replaceState(null, "", "/compliance");
    }
  };

  const setRiskStatus = async (index: number, status: RiskStatus) => {
    if (!loadedCheck || !result) return;
    const current = result.risks[index]?.status;
    const next: RiskStatus | null = current === status ? null : status; // click again to clear

    // Optimistic update so the UI feels instant.
    setResult((prev) =>
      prev
        ? { ...prev, risks: prev.risks.map((r, i) => (i === index ? { ...r, status: next ?? undefined } : r)) }
        : prev
    );

    const res = await authFetch(`/api/compliance/checks/${loadedCheck.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ riskIndex: index, status: next }),
    });
    if (!res.ok) {
      setToast({ message: "Could not save status. Please try again.", type: "error" });
      setResult((prev) =>
        prev
          ? { ...prev, risks: prev.risks.map((r, i) => (i === index ? { ...r, status: current } : r)) }
          : prev
      );
    }
  };

  const downloadDoc = async () => {
    if (!loadedCheck) return;
    const res = await authFetch(`/api/compliance/checks/${loadedCheck.id}/file`);
    if (!res.ok) {
      setToast({ message: "Could not download document.", type: "error" });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = loadedCheck.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // force = the user pressed "Check again" and wants a fresh opinion, not the
  // saved one.
  const handleCheck = async (force = false) => {
    setChecking(true);
    setResult(null);
    setLoadedCheck(null);
    setWasReused(false);

    try {
      if (mode === "existing" && selectedPolicy) {
        const res = await authFetch(
          `/api/policies/${selectedPolicy}/check${force ? "?force=1" : ""}`,
          { method: "POST" }
        );
        if (res.ok) {
          const data = await res.json();
          setResult(data);
          setWasReused(Boolean(data.duplicate));
          if (data.duplicate) {
            setToast({
              message: "Showing the saved result for this policy. Use Check again for a fresh one.",
              type: "success",
            });
          }
          // A check against a policy is a check like any other. The per-issue
          // status buttons and the document download used to be missing on
          // this tab for no better reason than that this branch never set
          // loadedCheck, because policy checks were kept in a separate store.
          setLoadedCheck({
            id: data.id,
            name: data.name,
            filename: data.filename,
            policyId: data.policyId ?? selectedPolicy,
          });
        } else {
          const err = await res.json();
          setToast({ message: err.error || "Check failed", type: "error" });
        }
      } else if (mode === "upload" && file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("name", name || file.name);
        if (force) formData.append("force", "1");

        const res = await authFetch("/api/compliance/check", {
          method: "POST",
          body: formData,
        });
        const contentType = res.headers.get("content-type") || "";
        if (res.ok && contentType.includes("application/json")) {
          const data = await res.json();
          setResult(data);
          if (data.id) {
            setLoadedCheck({
              id: data.id,
              name: data.name || name || (file ? file.name : ""),
              filename: data.filename || (file ? file.name : ""),
              policyId: data.policyId ?? null,
            });
          }
          setWasReused(Boolean(data.duplicate));
          if (data.duplicate) {
            setToast({
              message: "Showing the saved result for this document. Use Check again for a fresh one.",
              type: "success",
            });
          }
        } else if (contentType.includes("application/json")) {
          const err = await res.json();
          setToast({ message: err.error || "Check failed", type: "error" });
        } else {
          setToast({ message: `Server error (${res.status}). The check may have timed out — try a smaller document.`, type: "error" });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setToast({ message: `Request failed: ${msg}`, type: "error" });
    }

    setChecking(false);
  };

  // Adds the document behind this check to the Policies register. The file is
  // already in storage, so nothing is re-uploaded and the check it has already
  // been through is carried across rather than paid for again.
  const addToPolicies = async () => {
    if (!loadedCheck) return;
    setPromoting(true);
    const res = await authFetch(
      `/api/compliance/checks/${loadedCheck.id}/promote`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: promoteName.trim() || loadedCheck.name,
          category: promoteCategory,
        }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      setLoadedCheck({ ...loadedCheck, name: data.name, policyId: data.policyId });
      setPromoteOpen(false);
      fetchPolicies();
      setToast({
        message: `Added to the policy register under ${data.category}. Its compliance score went with it.`,
        type: "success",
      });
    } else {
      const err = await res.json().catch(() => ({}));
      setToast({
        message: err.error || "That document could not be added to the register.",
        type: "error",
      });
    }
    setPromoting(false);
  };

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark">Compliance Check</h1>
          <p className="text-gray-500 text-sm">
            Analyze policies against GDE/DoE/BELA guidelines using AI
          </p>
        </div>
        {result && (
          <button
            onClick={runNew}
            className="shrink-0 inline-flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Run New Check
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setMode("upload")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === "upload"
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Upload File
            </button>
            <button
              onClick={() => setMode("existing")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === "existing"
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              Select Existing
            </button>
          </div>

          {mode === "upload" ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Financial Management Policy"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
              <FileUpload
                onChange={pickFile}
                value={file}
                label="Upload policy to check"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Policy
              </label>
              <select
                value={selectedPolicy}
                onChange={(e) => setSelectedPolicy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              >
                <option value="">-- Choose a policy --</option>
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => handleCheck(false)}
            disabled={
              checking ||
              (mode === "upload" && !file) ||
              (mode === "existing" && !selectedPolicy)
            }
            className="mt-4 w-full bg-primary hover:bg-primary-dark text-white py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {checking ? "Analyzing..." : "Run Compliance Check"}
          </button>

          {checking && (
            <div className="mt-4 text-center">
              <div className="animate-pulse text-sm text-gray-500">
                AI is searching for the latest regulations and analyzing the document...
              </div>
              <p className="text-xs text-gray-400 mt-2">
                This may take a minute — checking uploaded guidelines and searching online for the latest GDE, DoE, SASA, and BELA Act requirements.
              </p>
            </div>
          )}
        </div>

        {result && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            {loadedCheck && (
              <div className="flex items-center justify-between gap-3 mb-4 pb-4 border-b border-gray-100">
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">Document</p>
                  <p className="text-sm font-medium text-dark truncate">{loadedCheck.name}</p>
                </div>
                <button
                  onClick={downloadDoc}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </button>
              </div>
            )}

            {loadedCheck && (
              <div className="mb-4 pb-4 border-b border-gray-100">
                {loadedCheck.policyId ? (
                  <p className="text-xs text-gray-500">
                    In the policy register.{" "}
                    <Link
                      href={`/policies/${loadedCheck.policyId}`}
                      className="text-primary hover:underline"
                    >
                      Open the policy
                    </Link>
                  </p>
                ) : session?.permissions.includes("upload_policies") ? (
                  promoteOpen ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Policy name
                        </label>
                        <input
                          type="text"
                          value={promoteName}
                          onChange={(e) => setPromoteName(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Category
                        </label>
                        <select
                          value={promoteCategory}
                          onChange={(e) => setPromoteCategory(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                        >
                          {categories.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={addToPolicies}
                          disabled={promoting}
                          className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                          {promoting ? "Adding..." : "Add to Policies"}
                        </button>
                        <button
                          onClick={() => setPromoteOpen(false)}
                          disabled={promoting}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-gray-500">
                        This document is not in the policy register.
                      </p>
                      <button
                        onClick={() => {
                          setPromoteName(loadedCheck.name);
                          setPromoteOpen(true);
                        }}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add to Policies
                      </button>
                    </div>
                  )
                ) : (
                  <p className="text-xs text-gray-500">
                    This document is not in the policy register.
                  </p>
                )}
              </div>
            )}
            <div className="text-center mb-2">
              <p className="text-sm text-gray-500 mb-2">Compliance Score</p>
              <ComplianceScore score={result.score} size="lg" />
              {wasReused && (
                <p className="mt-2 text-xs text-gray-500">
                  Saved result from an earlier check.
                </p>
              )}
            </div>
            <div className="mb-6">
              <ScoreNote />
              <button
                type="button"
                onClick={() => handleCheck(true)}
                disabled={
                  checking ||
                  (mode === "upload" && !file) ||
                  (mode === "existing" && !selectedPolicy)
                }
                className="mt-3 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {checking ? "Checking..." : "Check again"}
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">{result.summary}</p>

            {loadedCheck && result.risks.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mb-5">
                {STATUS_META.map((s) => (
                  <div key={s.key} className="border border-gray-100 rounded-lg px-3 py-2">
                    <p className={`text-2xl font-bold ${s.text}`}>
                      {result.risks.filter((r) => r.status === s.key).length}
                    </p>
                    <p className="text-[11px] text-gray-500 leading-tight">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            <h3 className="text-sm font-medium text-gray-500 mb-3">
              RISKS ({result.risks.length})
            </h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {result.risks.map((risk, i) => (
                <div
                  key={i}
                  className="border border-gray-100 rounded-lg p-3"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <RiskBadge severity={risk.severity} />
                    <span className="text-sm font-medium">{risk.section}</span>
                  </div>
                  <p className="text-sm text-gray-600">{risk.description}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Ref: {risk.guideline_reference}
                  </p>
                  <p className="text-xs text-primary mt-1">
                    {risk.suggestion}
                  </p>
                  {loadedCheck && (
                    <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-gray-50">
                      {STATUS_META.map((s) => {
                        const active = risk.status === s.key;
                        return (
                          <button
                            key={s.key}
                            onClick={() => setRiskStatus(i, s.key)}
                            className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                              active
                                ? s.active
                                : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                            }`}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              {result.risks.length === 0 && (
                <p className="text-sm text-emerald-600">No risks found.</p>
              )}
            </div>

            {result.sources && result.sources.length > 0 && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <h3 className="text-sm font-medium text-gray-500 mb-2">
                  ONLINE SOURCES CONSULTED
                </h3>
                <ul className="space-y-1">
                  {result.sources.map((source, i) => (
                    <li key={i}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline"
                      >
                        {source.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
