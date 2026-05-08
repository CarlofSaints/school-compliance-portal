"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback } from "react";
import FileUpload from "@/components/FileUpload";
import ComplianceScore from "@/components/ComplianceScore";
import RiskBadge from "@/components/RiskBadge";
import Toast from "@/components/Toast";

interface PolicyOption {
  id: string;
  name: string;
}

interface CheckResult {
  score: number;
  summary: string;
  risks: {
    severity: "low" | "medium" | "high";
    section: string;
    description: string;
    guideline_reference: string;
    suggestion: string;
  }[];
  sources?: { title: string; url: string }[];
}

export default function CompliancePage() {
  const { session, loading } = useAuth("check_compliance");
  const [mode, setMode] = useState<"upload" | "existing">("upload");
  const [policies, setPolicies] = useState<PolicyOption[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const fetchPolicies = useCallback(async () => {
    const res = await authFetch("/api/policies");
    if (res.ok) setPolicies(await res.json());
  }, []);

  useEffect(() => {
    if (session) fetchPolicies();
  }, [session, fetchPolicies]);

  const handleCheck = async () => {
    setChecking(true);
    setResult(null);

    try {
      if (mode === "existing" && selectedPolicy) {
        const res = await authFetch(
          `/api/policies/${selectedPolicy}/check`,
          { method: "POST" }
        );
        if (res.ok) {
          setResult(await res.json());
        } else {
          const err = await res.json();
          setToast({ message: err.error || "Check failed", type: "error" });
        }
      } else if (mode === "upload" && file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("name", name || file.name);

        const res = await authFetch("/api/compliance/check", {
          method: "POST",
          body: formData,
        });
        const contentType = res.headers.get("content-type") || "";
        if (res.ok && contentType.includes("application/json")) {
          setResult(await res.json());
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

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">Compliance Check</h1>
        <p className="text-gray-500 text-sm">
          Analyze policies against GDE/DoE/BELA guidelines using AI
        </p>
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
                onChange={setFile}
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
            onClick={handleCheck}
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
            <div className="text-center mb-6">
              <p className="text-sm text-gray-500 mb-2">Compliance Score</p>
              <ComplianceScore score={result.score} size="lg" />
            </div>
            <p className="text-sm text-gray-600 mb-4">{result.summary}</p>

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
