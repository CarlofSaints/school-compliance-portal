"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
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

export default function PolicyDetailPage() {
  const { session, loading } = useAuth("download_policies");
  const params = useParams();
  const policyId = params.id as string;
  const [data, setData] = useState<PolicyDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newVersionFile, setNewVersionFile] = useState<File | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);
  const [removingCheck, setRemovingCheck] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const fetchData = useCallback(async () => {
    setLoadError(null);
    // A policy opened straight after uploading it can briefly answer "not
    // found" while storage catches up, so a 404 is retried a few times before
    // it is believed. Anything else is reported at once. What must never
    // happen is silence: this page used to leave "Loading..." on screen for as
    // long as the fetch kept failing, with nothing to say why.
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await authFetch(`/api/policies/${policyId}`);
      if (res.ok) {
        setData(await res.json());
        return;
      }
      if (res.status !== 404) {
        setLoadError("This policy could not be loaded. Try again.");
        return;
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500));
    }
    setLoadError(
      "This policy is not in the repository. If you have just uploaded it, open Policies and press \"Rebuild list from storage\"."
    );
  }, [policyId]);

  useEffect(() => {
    if (session) fetchData();
  }, [session, fetchData]);

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

  // Undoes a compliance check. Nothing else in the portal can remove one, so a
  // check run against the wrong version leaves its score on the policy for
  // good.
  const removeCheck = async (checkId: string) => {
    if (
      !confirm(
        "Remove this compliance check? The policy goes back to the score from the check before it."
      )
    )
      return;

    setRemovingCheck(checkId);
    const res = await authFetch(
      `/api/policies/${policyId}/check?checkId=${encodeURIComponent(checkId)}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      // Use the policy the route hands back rather than re-reading it. An
      // overwrite takes a moment to propagate, so fetching again here can
      // return the score that has only just been removed and leave it on
      // screen until the next reload.
      const { policy } = await res.json();
      setData((d) =>
        d
          ? {
              ...d,
              policy: policy ?? d.policy,
              checks: d.checks.filter((c) => c.id !== checkId),
            }
          : d
      );
      setToast({ message: "Compliance check removed", type: "success" });
    } else {
      const err = await res.json().catch(() => ({}));
      setToast({
        message: err.error || "That check could not be removed.",
        type: "error",
      });
    }
    setRemovingCheck(null);
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

  if (loadError) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-700 mb-4">{loadError}</p>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Try again
          </button>
          <Link
            href="/policies"
            className="border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Back to Policies
          </Link>
        </div>
      </div>
    );
  }

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
          {session?.permissions.includes("upload_policies") && (
            <>
              {/* A different policy altogether, not a new version of this one.
                  Loading a run of policies otherwise means going back to the
                  repository list between every single one. */}
              <Link
                href="/policies/upload"
                className="border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                + Load a New Policy
              </Link>
              <button
                onClick={() => setShowUpload(!showUpload)}
                className="border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Upload New Version
              </button>
            </>
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
                  <div className="flex items-center">
                  <button
                    onClick={() =>
                      setExpandedCheck(
                        expandedCheck === check.id ? null : check.id
                      )
                    }
                    className="flex-1 px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50"
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
                  {session?.permissions.includes("manage_policies") && (
                    <button
                      onClick={() => removeCheck(check.id)}
                      disabled={removingCheck === check.id}
                      title="Removes this result and puts the score back to the check before it"
                      className="px-6 py-4 text-xs font-medium text-gray-400 hover:text-red-600 disabled:opacity-50"
                    >
                      {removingCheck === check.id ? "Removing..." : "Remove"}
                    </button>
                  )}
                  </div>

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
