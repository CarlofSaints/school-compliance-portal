"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Toast from "@/components/Toast";

interface QuoteDetail {
  supplierName: string;
  supplierWebsite?: string;
  supplierEmail: string;
  supplierPhone?: string;
}

interface SpendDetail {
  id: string;
  projectName: string;
  description: string;
  estimatedAmount: number;
  supplierConnection?: string;
  budgeted?: boolean;
  sourceOfFunds?: string;
  quotes: string[];
  quoteDetails?: QuoteDetail[];
  status: string;
  submittedByName: string;
  submittedAt: string;
  approvals: {
    userId: string;
    userName: string;
    position: string;
    decision: string;
    comments: string;
    decidedAt: string;
  }[];
}

export default function SpendDetailPage() {
  const { session, loading } = useAuth();
  const params = useParams();
  const spendId = params.id as string;
  const [data, setData] = useState<SpendDetail | null>(null);
  const [decision, setDecision] = useState("approved");
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const fetchData = useCallback(async () => {
    const res = await authFetch(`/api/spend/${spendId}`);
    if (res.ok) setData(await res.json());
  }, [spendId]);

  useEffect(() => {
    if (session) fetchData();
  }, [session, fetchData]);

  const handleDownloadQuote = async (quoteNum: number) => {
    setDownloading(quoteNum);
    try {
      const res = await authFetch(
        `/api/spend/${spendId}/quote/${quoteNum}`
      );
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const contentDisposition = res.headers.get("Content-Disposition");
        const filename =
          contentDisposition?.match(/filename="(.+)"/)?.[1] ||
          `quote-${quoteNum}.pdf`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        setToast({ message: "Failed to download quote", type: "error" });
      }
    } catch {
      setToast({ message: "Download failed", type: "error" });
    }
    setDownloading(null);
  };

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const res = await authFetch(`/api/spend/${spendId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, comments }),
    });

    if (res.ok) {
      setToast({ message: "Decision recorded", type: "success" });
      setComments("");
      fetchData();
    } else {
      const err = await res.json();
      setToast({ message: err.error || "Failed", type: "error" });
    }
    setSubmitting(false);
  };

  if (loading || !data) return <div className="p-6">Loading...</div>;

  const canApprove = session?.permissions.includes("approve_spend");
  const alreadyApproved = data.approvals.some(
    (a) => a.userId === session?.id
  );

  const statusColors: Record<string, string> = {
    pending: "bg-risk-low/10 text-risk-low border-risk-low/20",
    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-risk-high/10 text-risk-high border-risk-high/20",
    requires_changes:
      "bg-risk-medium/10 text-risk-medium border-risk-medium/20",
  };

  return (
    <div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-dark">
            {data.projectName}
          </h1>
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium border ${
              statusColors[data.status] || ""
            }`}
          >
            {data.status === "requires_changes"
              ? "Changes Required"
              : data.status.charAt(0).toUpperCase() + data.status.slice(1)}
          </span>
        </div>
        <p className="text-gray-500 text-sm">
          Submitted by {data.submittedByName} on{" "}
          {new Date(data.submittedAt).toLocaleDateString()}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Details */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-medium text-sm text-gray-500 mb-3">
              DETAILS
            </h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {data.description}
            </p>
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Estimated Amount</p>
              <p className="text-2xl font-bold text-dark">
                R{data.estimatedAmount.toLocaleString()}
              </p>
            </div>

            {/* New fields */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {data.supplierConnection && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">
                    Supplier Connection
                  </p>
                  <p className="text-sm font-medium text-dark mt-1">
                    {data.supplierConnection}
                  </p>
                </div>
              )}
              {data.budgeted !== undefined && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">Budgeted</p>
                  <p className="text-sm font-medium text-dark mt-1">
                    {data.budgeted ? "Yes" : "No"}
                  </p>
                </div>
              )}
              {data.sourceOfFunds && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">Source of Funds</p>
                  <p className="text-sm font-medium text-dark mt-1">
                    {data.sourceOfFunds}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Quotes */}
          {data.quotes.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="font-medium text-sm text-gray-500 mb-3">
                QUOTES ({data.quotes.length})
              </h3>
              <div className="space-y-3">
                {data.quotes.map((q, i) => {
                  const detail = data.quoteDetails?.[i];
                  return (
                    <div
                      key={i}
                      className="border border-gray-100 rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <svg
                            className="w-5 h-5 text-primary"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                          <span className="text-sm font-medium text-dark">
                            Quote {i + 1}
                            {detail?.supplierName &&
                              ` — ${detail.supplierName}`}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDownloadQuote(i + 1)}
                          disabled={downloading === i + 1}
                          className="flex items-center gap-1 text-xs text-primary hover:text-primary-dark font-medium transition-colors disabled:opacity-50"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                            />
                          </svg>
                          {downloading === i + 1
                            ? "Downloading..."
                            : "Download"}
                        </button>
                      </div>
                      {detail && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs">
                          {detail.supplierName && (
                            <div>
                              <span className="text-gray-400">Supplier</span>
                              <p className="text-gray-700">
                                {detail.supplierName}
                              </p>
                            </div>
                          )}
                          {detail.supplierEmail && (
                            <div>
                              <span className="text-gray-400">Email</span>
                              <p className="text-gray-700">
                                <a
                                  href={`mailto:${detail.supplierEmail}`}
                                  className="text-primary hover:underline"
                                >
                                  {detail.supplierEmail}
                                </a>
                              </p>
                            </div>
                          )}
                          {detail.supplierPhone && (
                            <div>
                              <span className="text-gray-400">Phone</span>
                              <p className="text-gray-700">
                                {detail.supplierPhone}
                              </p>
                            </div>
                          )}
                          {detail.supplierWebsite && (
                            <div>
                              <span className="text-gray-400">Website</span>
                              <p className="text-gray-700">
                                <a
                                  href={detail.supplierWebsite}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline"
                                >
                                  Visit
                                </a>
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Approval History */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-medium text-sm text-gray-500 mb-3">
              APPROVAL HISTORY ({data.approvals.length})
            </h3>
            {data.approvals.length > 0 ? (
              <div className="space-y-3">
                {data.approvals.map((a, i) => {
                  const decColors: Record<string, string> = {
                    approved: "text-emerald-600",
                    rejected: "text-risk-high",
                    requires_changes: "text-risk-medium",
                  };
                  return (
                    <div
                      key={i}
                      className="border border-gray-100 rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div>
                          <span className="font-medium text-sm">
                            {a.userName}
                          </span>
                          <span className="text-xs text-gray-400 ml-2">
                            {a.position}
                          </span>
                        </div>
                        <span
                          className={`text-xs font-medium ${
                            decColors[a.decision] || ""
                          }`}
                        >
                          {a.decision === "requires_changes"
                            ? "Requires Changes"
                            : a.decision.charAt(0).toUpperCase() +
                              a.decision.slice(1)}
                        </span>
                      </div>
                      {a.comments && (
                        <p className="text-sm text-gray-600 mt-1">
                          {a.comments}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(a.decidedAt).toLocaleString()}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">
                No decisions yet.
              </p>
            )}
          </div>
        </div>

        {/* Approval Form */}
        <div className="lg:col-span-1">
          {canApprove && !alreadyApproved && data.status === "pending" ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sticky top-6">
              <h3 className="font-medium text-sm text-gray-500 mb-3">
                YOUR DECISION
              </h3>
              <form onSubmit={handleApprove} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Decision
                  </label>
                  <select
                    value={decision}
                    onChange={(e) => setDecision(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  >
                    <option value="approved">Approve</option>
                    <option value="rejected">Reject</option>
                    <option value="requires_changes">
                      Requires Changes
                    </option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Comments
                  </label>
                  <textarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    rows={4}
                    placeholder="Add any comments or conditions..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-primary hover:bg-primary-dark text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {submitting ? "Submitting..." : "Submit Decision"}
                </button>
              </form>
            </div>
          ) : canApprove && alreadyApproved ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center text-gray-400 text-sm">
              You have already submitted your decision.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
