"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import ComplianceScore from "@/components/ComplianceScore";
import RiskBadge from "@/components/RiskBadge";
import FileUpload from "@/components/FileUpload";
import Toast from "@/components/Toast";

interface PolicyDetail {
  policy: {
    id: string;
    name: string;
    description: string;
    category: string;
    currentVersion: number;
    lastCheckScore: number | null;
    lastCheckDate: string | null;
  };
  versions: {
    version: number;
    filename: string;
    ext: string;
    uploadedAt: string;
    size: number;
  }[];
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

// Just enough of a policy to fill the switcher.
interface PolicyListItem {
  id: string;
  name: string;
}

export default function PolicyDetailPage() {
  const { session, loading } = useAuth("download_policies");
  const params = useParams();
  const router = useRouter();
  const policyId = params.id as string;
  const [data, setData] = useState<PolicyDetail | null>(null);
  const [policyList, setPolicyList] = useState<PolicyListItem[]>([]);
  const [checking, setChecking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newVersionFile, setNewVersionFile] = useState<File | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const fetchData = useCallback(async () => {
    const res = await authFetch(`/api/policies/${policyId}`);
    if (res.ok) setData(await res.json());
  }, [policyId]);

  // The repository list, so another policy can be opened from here rather than
  // going back to /policies and clicking in again.
  const fetchPolicyList = useCallback(async () => {
    const res = await authFetch("/api/policies");
    if (!res.ok) return;
    const all = await res.json();
    if (Array.isArray(all)) setPolicyList(all);
  }, []);

  useEffect(() => {
    if (session) {
      fetchData();
      fetchPolicyList();
    }
  }, [session, fetchData, fetchPolicyList]);

  const runCheck = async () => {
    setChecking(true);
    const res = await authFetch(`/api/policies/${policyId}/check`, {
      method: "POST",
    });
    if (res.ok) {
      setToast({ message: "Compliance check complete", type: "success" });
      fetchData();
    } else {
      const err = await res.json();
      setToast({ message: err.error || "Check failed", type: "error" });
    }
    setChecking(false);
  };

  const uploadVersion = async () => {
    if (!newVersionFile) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", newVersionFile);

    const res = await authFetch(`/api/policies/${policyId}/versions`, {
      method: "POST",
      body: formData,
    });
    if (res.ok) {
      setToast({ message: "New version uploaded", type: "success" });
      setShowUpload(false);
      setNewVersionFile(null);
      fetchData();
    } else {
      setToast({ message: "Upload failed", type: "error" });
    }
    setUploading(false);
  };

  if (loading || !data) return <div className="p-6">Loading...</div>;

  const { policy, versions, checks } = data;

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">{policy.name}</h1>
          <p className="text-gray-500 text-sm mt-1">{policy.description}</p>
          <span className="inline-block bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs mt-2">
            {policy.category}
          </span>
        </div>
        <div className="flex gap-2">
          {/* Rendered only once the list is in and contains this policy: a
              select whose value matches no option silently displays the FIRST
              one, which would name the wrong policy. */}
          {policyList.some((p) => p.id === policyId) && (
            <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-white">
              <span className="text-xs text-gray-500 whitespace-nowrap">
                Load a policy
              </span>
              <select
                value={policyId}
                aria-label="Load a policy"
                onChange={(e) => {
                  if (e.target.value !== policyId) {
                    router.push(`/policies/${e.target.value}`);
                  }
                }}
                className="text-sm bg-transparent outline-none max-w-[220px] cursor-pointer"
              >
                {policyList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {session?.permissions.includes("upload_policies") && (
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Upload New Version
            </button>
          )}
          {session?.permissions.includes("check_compliance") && (
            <button
              onClick={runCheck}
              disabled={checking}
              className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {checking ? "Checking..." : "Run Compliance Check"}
            </button>
          )}
        </div>
      </div>

      {showUpload && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6 max-w-lg">
          <h3 className="font-medium mb-3">Upload New Version</h3>
          <FileUpload onChange={setNewVersionFile} value={newVersionFile} />
          <div className="flex gap-3 mt-4">
            <button
              onClick={uploadVersion}
              disabled={!newVersionFile || uploading}
              className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
            <button
              onClick={() => { setShowUpload(false); setNewVersionFile(null); }}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Versions */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="font-medium text-sm text-gray-500 mb-3">
              VERSION HISTORY
            </h3>
            {versions.map((v) => (
              <div
                key={v.version}
                className="py-2 border-b border-gray-50 last:border-0 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium">
                    v{v.version}
                    {v.version === policy.currentVersion && (
                      <span className="ml-2 text-xs text-primary">(current)</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(v.uploadedAt).toLocaleDateString()} &middot;{" "}
                    {(v.size / 1024).toFixed(0)} KB
                  </p>
                </div>
                <span className="text-xs text-gray-400">{v.filename}</span>
              </div>
            ))}
            {versions.length === 0 && (
              <p className="text-xs text-gray-400 italic">No versions</p>
            )}
          </div>

          {policy.lastCheckScore !== null && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-4 text-center">
              <p className="text-sm text-gray-500 mb-2">Latest Score</p>
              <ComplianceScore score={policy.lastCheckScore} size="lg" />
            </div>
          )}
        </div>

        {/* Compliance Checks */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-medium text-sm text-gray-500">
                COMPLIANCE CHECKS ({checks.length})
              </h3>
            </div>
            {checks.length > 0 ? (
              checks.map((check) => (
                <div
                  key={check.id}
                  className="border-b border-gray-50 last:border-0"
                >
                  <button
                    onClick={() =>
                      setExpandedCheck(
                        expandedCheck === check.id ? null : check.id
                      )
                    }
                    className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-4">
                      <ComplianceScore score={check.score} size="sm" />
                      <div>
                        <p className="text-sm font-medium">
                          Score: {check.score}/100
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(check.checkedAt).toLocaleString()} &middot;{" "}
                          {check.risks.length} risks found
                        </p>
                      </div>
                    </div>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${
                        expandedCheck === check.id ? "rotate-90" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>

                  {expandedCheck === check.id && (
                    <div className="px-6 pb-4">
                      <p className="text-sm text-gray-600 mb-4">
                        {check.summary}
                      </p>
                      <div className="space-y-3">
                        {check.risks.map((risk, i) => (
                          <div
                            key={i}
                            className="border border-gray-100 rounded-lg p-4"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <RiskBadge severity={risk.severity} />
                              <span className="text-sm font-medium">
                                {risk.section}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600">
                              {risk.description}
                            </p>
                            <p className="text-xs text-gray-400 mt-2">
                              Reference: {risk.guideline_reference}
                            </p>
                            <p className="text-xs text-primary mt-1">
                              Suggestion: {risk.suggestion}
                            </p>
                          </div>
                        ))}
                        {check.risks.length === 0 && (
                          <p className="text-sm text-emerald-600">
                            No compliance risks found.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="px-6 py-12 text-center text-gray-400 text-sm">
                No compliance checks run yet. Click &quot;Run Compliance
                Check&quot; to analyze this policy.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
