"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import ComplianceScore from "@/components/ComplianceScore";
import ScoreNote from "@/components/ScoreNote";
import RiskBadge from "@/components/RiskBadge";
import Toast from "@/components/Toast";

interface DocDetail {
  document: {
    id: string;
    name: string;
    description: string;
    filename: string;
    uploadedAt: string;
  };
  checks: {
    id: string;
    score: number;
    summary: string;
    risks: {
      severity: "low" | "medium" | "high";
      section: string;
      description: string;
      guideline_reference: string;
      suggestion: string;
    }[];
    checkedAt: string;
  }[];
}

export default function DocumentResultsPage() {
  const { session, loading } = useAuth("check_documents");
  const params = useParams();
  const docId = params.id as string;
  const [data, setData] = useState<DocDetail | null>(null);
  const [checking, setChecking] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const fetchData = useCallback(async () => {
    const res = await authFetch(`/api/documents/${docId}`);
    if (res.ok) setData(await res.json());
  }, [docId]);

  useEffect(() => {
    if (session) fetchData();
  }, [session, fetchData]);

  const runCheck = async () => {
    setChecking(true);
    const res = await authFetch(`/api/documents/${docId}/check`, {
      method: "POST",
    });
    if (res.ok) {
      setToast({ message: "Check complete", type: "success" });
      fetchData();
    } else {
      const err = await res.json();
      setToast({ message: err.error || "Check failed", type: "error" });
    }
    setChecking(false);
  };

  if (loading || !data) return <div className="p-6">Loading...</div>;

  const { document: doc, checks } = data;
  const latestCheck = checks[0];

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">{doc.name}</h1>
          <p className="text-gray-500 text-sm mt-1">{doc.description}</p>
          <p className="text-xs text-gray-400 mt-1">
            {doc.filename} &middot; Uploaded{" "}
            {new Date(doc.uploadedAt).toLocaleDateString()}
          </p>
        </div>
        <button
          onClick={runCheck}
          disabled={checking}
          className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {checking ? "Checking..." : "Run Check"}
        </button>
      </div>

      {latestCheck && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center">
            <p className="text-sm text-gray-500 mb-2">Latest Score</p>
            <ComplianceScore score={latestCheck.score} size="lg" />
            <p className="text-xs text-gray-400 mt-2">
              {new Date(latestCheck.checkedAt).toLocaleString()}
            </p>
            <div className="text-left">
              <ScoreNote />
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <p className="text-sm text-gray-600 mb-4">{latestCheck.summary}</p>
            <h3 className="text-sm font-medium text-gray-500 mb-3">
              RISKS ({latestCheck.risks.length})
            </h3>
            <div className="space-y-3">
              {latestCheck.risks.map((risk, i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-3">
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
              {latestCheck.risks.length === 0 && (
                <p className="text-sm text-emerald-600">No risks found.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {!latestCheck && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
          No checks run yet. Click &quot;Run Check&quot; to analyze this document.
        </div>
      )}
    </div>
  );
}
