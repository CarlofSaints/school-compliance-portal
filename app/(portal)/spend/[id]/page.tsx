"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Toast from "@/components/Toast";

const STATUS_DISPLAY: Record<string, string> = {
  pending: "APPLIED",
  pending_decision: "PENDING DECISION",
  approved: "APPROVED",
  rejected: "DECLINED",
  requires_changes: "NEEDS MORE WORK",
  completed: "COMPLETED",
};

interface QuoteDetail {
  supplierName: string;
  supplierWebsite?: string;
  supplierEmail: string;
  supplierPhone?: string;
  priceExclVat?: number;
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
  submittedBy: string;
  submittedByName: string;
  submittedAt: string;
  applicantName?: string;
  applicantSurname?: string;
  applicantEmail?: string;
  submittedOnBehalf?: boolean;
  preferredQuotes?: { userId: string; quoteIndex: number }[];
  selectedQuoteIndex?: number;
  approvedAmount?: number;
  completedAt?: string;
  completedBy?: string;
  finishedOnTime?: boolean;
  finishedWithinBudget?: boolean;
  budgetOverrunAmount?: number;
  budgetOverrunExplanation?: string;
  approvals: {
    userId: string;
    userName: string;
    position: string;
    decision: string;
    comments: string;
    decidedAt: string;
    preferredQuoteIndex?: number;
  }[];
}

export default function SpendDetailPage() {
  const { session, loading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const spendId = params.id as string;
  const [data, setData] = useState<SpendDetail | null>(null);
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [selectedQuotePreference, setSelectedQuotePreference] = useState<
    number | undefined
  >(undefined);
  const [showCommentsFor, setShowCommentsFor] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Complete project modal state
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [finishedOnTime, setFinishedOnTime] = useState(true);
  const [finishedWithinBudget, setFinishedWithinBudget] = useState(true);
  const [budgetOverrunAmount, setBudgetOverrunAmount] = useState("");
  const [budgetOverrunExplanation, setBudgetOverrunExplanation] = useState("");
  const [completing, setCompleting] = useState(false);

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

  const handleDecision = async (decision: string) => {
    if (decision === "requires_changes" && !comments.trim()) {
      setToast({
        message: "Please add comments explaining what needs to change",
        type: "error",
      });
      return;
    }
    setSubmitting(true);
    const res = await authFetch(`/api/spend/${spendId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        comments,
        preferredQuoteIndex: selectedQuotePreference,
      }),
    });

    if (res.ok) {
      setToast({ message: "Decision recorded", type: "success" });
      setComments("");
      setShowCommentsFor(null);
      setSelectedQuotePreference(undefined);
      fetchData();
    } else {
      const err = await res.json();
      setToast({ message: err.error || "Failed", type: "error" });
    }
    setSubmitting(false);
  };

  const handleConfirmQuote = async (quoteIndex: number) => {
    setSubmitting(true);
    const res = await authFetch(`/api/spend/${spendId}/select-quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteIndex }),
    });
    if (res.ok) {
      setToast({ message: "Quote confirmed", type: "success" });
      fetchData();
    } else {
      const err = await res.json();
      setToast({ message: err.error || "Failed", type: "error" });
    }
    setSubmitting(false);
  };

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setCompleting(true);
    const res = await authFetch(`/api/spend/${spendId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        finishedOnTime,
        finishedWithinBudget,
        budgetOverrunAmount: finishedWithinBudget
          ? 0
          : parseFloat(budgetOverrunAmount) || 0,
        budgetOverrunExplanation: finishedWithinBudget
          ? ""
          : budgetOverrunExplanation,
      }),
    });
    if (res.ok) {
      setToast({ message: "Project marked as completed", type: "success" });
      setShowCompleteModal(false);
      fetchData();
    } else {
      const err = await res.json();
      setToast({ message: err.error || "Failed", type: "error" });
    }
    setCompleting(false);
  };

  const handleForceApprove = async () => {
    if (!confirm("Mark this application as already approved? This skips the normal approval flow.")) return;
    setSubmitting(true);
    const res = await authFetch(`/api/spend/${spendId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forceApprove: true }),
    });
    if (res.ok) {
      setToast({ message: "Marked as approved", type: "success" });
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
  const isSubmitter = data.submittedBy === session?.id;
  const isAdmin =
    session?.permissions.includes("manage_spend_settings") ||
    session?.permissions.includes("manage_users");
  const canEdit =
    (isSubmitter || isAdmin) &&
    data.status !== "approved" &&
    data.status !== "completed";
  const canDecide =
    canApprove &&
    !alreadyApproved &&
    (data.status === "pending" || data.status === "pending_decision");
  const canComplete =
    data.status === "approved" &&
    (canApprove || isAdmin);
  const canSelectQuote =
    data.status === "approved" &&
    data.selectedQuoteIndex === undefined &&
    (canApprove || isAdmin);

  const statusColors: Record<string, string> = {
    pending: "bg-risk-low/10 text-risk-low border-risk-low/20",
    pending_decision: "bg-blue-50 text-blue-700 border-blue-200",
    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-risk-high/10 text-risk-high border-risk-high/20",
    requires_changes:
      "bg-risk-medium/10 text-risk-medium border-risk-medium/20",
    completed: "bg-purple-50 text-purple-700 border-purple-200",
  };

  // Count quote preferences
  const quotePrefCounts: Record<number, number> = {};
  (data.preferredQuotes || []).forEach((pq) => {
    quotePrefCounts[pq.quoteIndex] =
      (quotePrefCounts[pq.quoteIndex] || 0) + 1;
  });

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
          <Link
            href="/spend"
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
            &larr; Back
          </Link>
          <h1 className="text-2xl font-bold text-dark">
            {data.projectName}
          </h1>
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium border ${
              statusColors[data.status] || ""
            }`}
          >
            {STATUS_DISPLAY[data.status] || data.status}
          </span>
        </div>
        <p className="text-gray-500 text-sm">
          Submitted by {data.submittedByName} on{" "}
          {new Date(data.submittedAt).toLocaleDateString()}
          {data.submittedOnBehalf && (
            <span className="ml-2 text-primary">
              (on behalf of {data.applicantName} {data.applicantSurname})
            </span>
          )}
        </p>
        <div className="flex gap-2 mt-3">
          {canEdit && (
            <Link
              href={`/spend/${data.id}/edit`}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            >
              Edit Application
            </Link>
          )}
          {canComplete && (
            <button
              onClick={() => setShowCompleteModal(true)}
              className="bg-purple-100 hover:bg-purple-200 text-purple-700 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            >
              Complete Project
            </button>
          )}
          {isAdmin && data.status !== "approved" && data.status !== "completed" && (
            <button
              onClick={handleForceApprove}
              disabled={submitting}
              className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            >
              Already Approved
            </button>
          )}
        </div>
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

            {/* Applicant info if on behalf */}
            {data.submittedOnBehalf && (
              <div className="mt-4 p-3 bg-primary/5 rounded-lg border border-primary/10">
                <p className="text-xs text-gray-500 mb-1">
                  Application For
                </p>
                <p className="text-sm font-medium text-dark">
                  {data.applicantName} {data.applicantSurname}
                </p>
                <p className="text-xs text-gray-500">{data.applicantEmail}</p>
              </div>
            )}
          </div>

          {/* Quote Price Summary */}
          {data.quoteDetails &&
            data.quoteDetails.some((d) => d.priceExclVat) &&
            (() => {
              const prices = data.quoteDetails!
                .map((d) => d.priceExclVat || 0)
                .filter((p) => p > 0);
              if (prices.length === 0) return null;
              const highest = Math.max(...prices);
              const lowest = Math.min(...prices);
              const average =
                prices.reduce((a, b) => a + b, 0) / prices.length;
              return (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <h3 className="font-medium text-sm text-gray-500 mb-3">
                    QUOTE PRICE SUMMARY (Excl. VAT)
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 bg-risk-high/5 rounded-lg text-center">
                      <p className="text-xs text-gray-500">Highest</p>
                      <p className="text-xl font-bold text-risk-high mt-1">
                        R
                        {highest.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                    <div className="p-4 bg-emerald-50 rounded-lg text-center">
                      <p className="text-xs text-gray-500">Lowest</p>
                      <p className="text-xl font-bold text-emerald-600 mt-1">
                        R
                        {lowest.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                    <div className="p-4 bg-primary/5 rounded-lg text-center">
                      <p className="text-xs text-gray-500">Average</p>
                      <p className="text-xl font-bold text-primary mt-1">
                        R
                        {average.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}

          {/* Quotes */}
          {data.quotes.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="font-medium text-sm text-gray-500 mb-3">
                QUOTES ({data.quotes.length})
              </h3>
              <div className="space-y-3">
                {data.quotes.map((q, i) => {
                  const detail = data.quoteDetails?.[i];
                  const isSelected = data.selectedQuoteIndex === i;
                  const prefCount = quotePrefCounts[i] || 0;
                  return (
                    <div
                      key={i}
                      className={`border rounded-lg p-4 ${
                        isSelected
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-gray-100"
                      }`}
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
                          {isSelected && (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full font-medium">
                              SELECTED
                            </span>
                          )}
                          {prefCount > 0 && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                              {prefCount} preference{prefCount !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {canSelectQuote && (
                            <button
                              onClick={() => handleConfirmQuote(i)}
                              disabled={submitting}
                              className="text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-2 py-1 rounded font-medium transition-colors disabled:opacity-50"
                            >
                              Confirm This Quote
                            </button>
                          )}
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
                      </div>
                      {detail && (
                        <>
                          {detail.priceExclVat !== undefined &&
                            detail.priceExclVat > 0 && (
                              <div className="mt-2 p-2 bg-gray-50 rounded inline-block">
                                <span className="text-xs text-gray-400">
                                  Price Excl. VAT:{" "}
                                </span>
                                <span className="text-sm font-semibold text-dark">
                                  R
                                  {detail.priceExclVat.toLocaleString(
                                    undefined,
                                    {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    }
                                  )}
                                </span>
                              </div>
                            )}
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
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completion Info */}
          {data.status === "completed" && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="font-medium text-sm text-gray-500 mb-3">
                COMPLETION DETAILS
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">Finished On Time</p>
                  <p
                    className={`text-sm font-medium mt-1 ${
                      data.finishedOnTime ? "text-emerald-600" : "text-risk-high"
                    }`}
                  >
                    {data.finishedOnTime ? "Yes" : "No"}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">
                    Finished Within Budget
                  </p>
                  <p
                    className={`text-sm font-medium mt-1 ${
                      data.finishedWithinBudget
                        ? "text-emerald-600"
                        : "text-risk-high"
                    }`}
                  >
                    {data.finishedWithinBudget ? "Yes" : "No"}
                  </p>
                </div>
                {!data.finishedWithinBudget && data.budgetOverrunAmount && (
                  <>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">
                        Budget Overrun Amount
                      </p>
                      <p className="text-sm font-medium text-risk-high mt-1">
                        R{data.budgetOverrunAmount.toLocaleString()}
                      </p>
                    </div>
                    {data.budgetOverrunExplanation && (
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500">Explanation</p>
                        <p className="text-sm text-gray-700 mt-1">
                          {data.budgetOverrunExplanation}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
              {data.completedAt && (
                <p className="text-xs text-gray-400 mt-3">
                  Completed on{" "}
                  {new Date(data.completedAt).toLocaleDateString()}
                </p>
              )}
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
                        <div className="flex items-center gap-2">
                          {a.preferredQuoteIndex !== undefined && (
                            <span className="text-xs text-blue-600">
                              Preferred Quote {a.preferredQuoteIndex + 1}
                            </span>
                          )}
                          <span
                            className={`text-xs font-medium ${
                              decColors[a.decision] || ""
                            }`}
                          >
                            {STATUS_DISPLAY[a.decision] ||
                              a.decision.charAt(0).toUpperCase() +
                                a.decision.slice(1)}
                          </span>
                        </div>
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

        {/* Approval Buttons Panel */}
        <div className="lg:col-span-1 space-y-4">
          {/* Decision panel */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sticky top-6">
            <h3 className="font-medium text-sm text-gray-500 mb-3">
              YOUR DECISION
            </h3>

            {canDecide ? (
              <div className="space-y-4">
                {/* Quote Preference */}
                {data.quoteDetails && data.quoteDetails.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Preferred Quote (optional)
                    </label>
                    <div className="space-y-2">
                      {data.quoteDetails.map((qd, i) => (
                        <label
                          key={i}
                          className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border ${
                            selectedQuotePreference === i
                              ? "border-primary bg-primary/5"
                              : "border-gray-100 hover:bg-gray-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="quotePreference"
                            checked={selectedQuotePreference === i}
                            onChange={() => setSelectedQuotePreference(i)}
                            className="w-4 h-4 text-primary focus:ring-primary"
                          />
                          <div className="text-xs">
                            <span className="font-medium">
                              Quote {i + 1}
                            </span>
                            {qd.supplierName && (
                              <span className="text-gray-500">
                                {" "}
                                — {qd.supplierName}
                              </span>
                            )}
                            {qd.priceExclVat ? (
                              <span className="text-gray-500 ml-1">
                                (R
                                {qd.priceExclVat.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                                )
                              </span>
                            ) : null}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Comments area - shown when Needs More Work or after clicking any button */}
                {showCommentsFor && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Comments{" "}
                      {showCommentsFor === "requires_changes" && (
                        <span className="text-risk-high">*</span>
                      )}
                    </label>
                    <textarea
                      value={comments}
                      onChange={(e) => setComments(e.target.value)}
                      rows={4}
                      placeholder={
                        showCommentsFor === "requires_changes"
                          ? "Explain what changes are needed..."
                          : "Add any comments or conditions..."
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleDecision(showCommentsFor)}
                        disabled={submitting}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                          showCommentsFor === "approved"
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                            : showCommentsFor === "rejected"
                            ? "bg-risk-high hover:bg-red-700 text-white"
                            : "bg-amber-500 hover:bg-amber-600 text-white"
                        }`}
                      >
                        {submitting
                          ? "Submitting..."
                          : `Confirm ${
                              showCommentsFor === "approved"
                                ? "Approval"
                                : showCommentsFor === "rejected"
                                ? "Decline"
                                : "Needs More Work"
                            }`}
                      </button>
                      <button
                        onClick={() => {
                          setShowCommentsFor(null);
                          setComments("");
                        }}
                        className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Decision buttons */}
                {!showCommentsFor && (
                  <div className="space-y-2">
                    <button
                      onClick={() => setShowCommentsFor("approved")}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setShowCommentsFor("rejected")}
                      className="w-full bg-risk-high hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => setShowCommentsFor("requires_changes")}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
                    >
                      Needs More Work
                    </button>
                  </div>
                )}
              </div>
            ) : canApprove && alreadyApproved ? (
              <p className="text-sm text-gray-400 italic text-center py-4">
                You have already submitted your decision.
              </p>
            ) : !canApprove ? (
              <div className="space-y-2">
                <button
                  disabled
                  className="w-full bg-gray-200 text-gray-400 py-2.5 rounded-lg text-sm font-medium cursor-not-allowed"
                  title="You do not have permission to approve spend applications"
                >
                  Approve
                </button>
                <button
                  disabled
                  className="w-full bg-gray-200 text-gray-400 py-2.5 rounded-lg text-sm font-medium cursor-not-allowed"
                  title="You do not have permission to approve spend applications"
                >
                  Decline
                </button>
                <button
                  disabled
                  className="w-full bg-gray-200 text-gray-400 py-2.5 rounded-lg text-sm font-medium cursor-not-allowed"
                  title="You do not have permission to approve spend applications"
                >
                  Needs More Work
                </button>
                <p className="text-xs text-gray-400 text-center mt-2">
                  You do not have permission to make decisions on spend applications.
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic text-center py-4">
                {data.status === "approved"
                  ? "This application has been approved."
                  : data.status === "rejected"
                  ? "This application has been declined."
                  : data.status === "completed"
                  ? "This project has been completed."
                  : "Decisions are not available for this status."}
              </p>
            )}
          </div>

          {/* Approved Amount */}
          {data.approvedAmount !== undefined && data.approvedAmount > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="font-medium text-sm text-gray-500 mb-2">
                APPROVED AMOUNT
              </h3>
              <p className="text-2xl font-bold text-emerald-600">
                R{data.approvedAmount.toLocaleString()}
              </p>
              {data.selectedQuoteIndex !== undefined &&
                data.quoteDetails?.[data.selectedQuoteIndex] && (
                  <p className="text-xs text-gray-500 mt-1">
                    From Quote {data.selectedQuoteIndex + 1} —{" "}
                    {data.quoteDetails[data.selectedQuoteIndex].supplierName}
                  </p>
                )}
            </div>
          )}
        </div>
      </div>

      {/* Complete Project Modal */}
      {showCompleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Complete Project</h2>
            <form onSubmit={handleComplete} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Did the project finish on time?
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="onTime"
                      checked={finishedOnTime}
                      onChange={() => setFinishedOnTime(true)}
                      className="w-4 h-4 text-primary focus:ring-primary"
                    />
                    <span className="text-sm">Yes</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="onTime"
                      checked={!finishedOnTime}
                      onChange={() => setFinishedOnTime(false)}
                      className="w-4 h-4 text-primary focus:ring-primary"
                    />
                    <span className="text-sm">No</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Did the project finish within budget?
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="withinBudget"
                      checked={finishedWithinBudget}
                      onChange={() => setFinishedWithinBudget(true)}
                      className="w-4 h-4 text-primary focus:ring-primary"
                    />
                    <span className="text-sm">Yes</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="withinBudget"
                      checked={!finishedWithinBudget}
                      onChange={() => setFinishedWithinBudget(false)}
                      className="w-4 h-4 text-primary focus:ring-primary"
                    />
                    <span className="text-sm">No</span>
                  </label>
                </div>
              </div>

              {!finishedWithinBudget && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      By how much did the project overrun? (ZAR)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                        R
                      </span>
                      <input
                        type="number"
                        value={budgetOverrunAmount}
                        onChange={(e) =>
                          setBudgetOverrunAmount(e.target.value)
                        }
                        min="0"
                        step="0.01"
                        required
                        className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Brief explanation
                    </label>
                    <textarea
                      value={budgetOverrunExplanation}
                      onChange={(e) =>
                        setBudgetOverrunExplanation(e.target.value)
                      }
                      rows={3}
                      required
                      placeholder="Explain the budget overrun..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none"
                    />
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={completing}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {completing ? "Completing..." : "Mark as Completed"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCompleteModal(false)}
                  className="px-6 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
