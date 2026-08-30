"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const STATUS_DISPLAY: Record<string, string> = {
  pending: "APPLIED",
  pending_decision: "PENDING DECISION",
  approved: "APPROVED",
  rejected: "DECLINED",
  requires_changes: "NEEDS MORE WORK",
  completed: "COMPLETED",
};

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Applied" },
  { key: "pending_decision", label: "Pending Decision" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Declined" },
  { key: "requires_changes", label: "Needs More Work" },
  { key: "completed", label: "Completed" },
];

interface SpendRecord {
  id: string;
  projectName: string;
  estimatedAmount: number;
  sourceOfFunds?: string;
  budgeted?: boolean;
  status: string;
  submittedByName: string;
  submittedAt: string;
  applicantName?: string;
  applicantSurname?: string;
  submittedOnBehalf?: boolean;
  approvedAmount?: number;
  finishedWithinBudget?: boolean;
  quoteDetails?: { supplierName: string; priceExclVat?: number }[];
  approvals: { userName: string; decision: string }[];
}

interface SpendSettings {
  capexBudget: number;
  capexYear: number;
}

export default function SpendPage() {
  const { session, loading } = useAuth("submit_spend");
  const [apps, setApps] = useState<SpendRecord[]>([]);
  const [settings, setSettings] = useState<SpendSettings | null>(null);
  const [filter, setFilter] = useState("all");

  const fetchData = useCallback(async () => {
    const [appsRes, settingsRes] = await Promise.all([
      authFetch("/api/spend"),
      authFetch("/api/settings/spend"),
    ]);
    if (appsRes.ok) setApps(await appsRes.json());
    if (settingsRes.ok) setSettings(await settingsRes.json());
  }, []);

  useEffect(() => {
    if (session) fetchData();
  }, [session, fetchData]);

  const filtered =
    filter === "all" ? apps : apps.filter((a) => a.status === filter);

  // Dashboard calculations
  const pendingCount = apps.filter(
    (a) => a.status === "pending" || a.status === "pending_decision"
  ).length;
  const totalPendingSpend = apps
    .filter(
      (a) => a.status === "pending" || a.status === "pending_decision"
    )
    .reduce((sum, a) => sum + a.estimatedAmount, 0);
  const totalApprovedSpend = apps
    .filter((a) => a.status === "approved" || a.status === "completed")
    .reduce((sum, a) => sum + (a.approvedAmount || 0), 0);
  const capexBudget = settings?.capexBudget || 0;
  const capexRemaining = capexBudget - totalApprovedSpend;
  const capexYear = settings?.capexYear || new Date().getFullYear();

  // Bulk import writes applications on other people's behalf, so it matches the
  // permission the import API enforces rather than plain submit_spend.
  const canImport =
    session?.permissions.includes("manage_spend_settings") ?? false;

  const statusColors: Record<string, string> = {
    pending: "bg-risk-low/10 text-risk-low",
    pending_decision: "bg-blue-50 text-blue-700",
    approved: "bg-emerald-100 text-emerald-700",
    rejected: "bg-risk-high/10 text-risk-high",
    requires_changes: "bg-risk-medium/10 text-risk-medium",
    completed: "bg-purple-100 text-purple-700",
  };

  const handleCSVExport = () => {
    const headers = [
      "Project Name",
      "Est. Amount",
      "Source of Funds",
      "Budgeted",
      "# Quotes",
      "Submitted By",
      "Applicant",
      "Date",
      "Status",
      "Stuck to Budget",
    ];

    const rows = filtered.map((app) => [
      `"${app.projectName.replace(/"/g, '""')}"`,
      app.estimatedAmount,
      app.sourceOfFunds || "",
      app.budgeted ? "Yes" : "No",
      app.quoteDetails?.length || 0,
      `"${app.submittedByName.replace(/"/g, '""')}"`,
      app.submittedOnBehalf
        ? `"${app.applicantName || ""} ${app.applicantSurname || ""}"`
        : `"${app.submittedByName.replace(/"/g, '""')}"`,
      new Date(app.submittedAt).toLocaleDateString(),
      STATUS_DISPLAY[app.status] || app.status,
      app.status === "completed"
        ? app.finishedWithinBudget
          ? "YES"
          : "NO"
        : "",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join(
      "\n"
    );
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `spend-applications-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">Spend Applications</h1>
          <p className="text-gray-500 text-sm">
            {apps.length} application{apps.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {canImport && (
            <Link
              href="/spend/import"
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Import from Excel
            </Link>
          )}
          <button
            onClick={handleCSVExport}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Export CSV
          </button>
          <Link
            href="/spend/new"
            className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            + New Application
          </Link>
        </div>
      </div>

      {/* Dashboard Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500">
            Total CAPEX {capexYear}
          </p>
          <p className="text-xl font-bold text-dark mt-1">
            R{capexBudget.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500">Pending Projects</p>
          <p className="text-xl font-bold text-risk-low mt-1">
            {pendingCount}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500">Total Pending Spend</p>
          <p className="text-xl font-bold text-risk-medium mt-1">
            R{totalPendingSpend.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500">Total Approved Spend</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">
            R{totalApprovedSpend.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500">CAPEX Remaining</p>
          <p
            className={`text-xl font-bold mt-1 ${
              capexRemaining >= 0 ? "text-emerald-600" : "text-risk-high"
            }`}
          >
            R{capexRemaining.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f.key
                ? "bg-primary text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Enhanced Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  Project
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  Est. Amount
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  Source
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  Budgeted
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  Quotes
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  Submitted By
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  Applicant
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  Date
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  Status
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  Budget
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((app) => {
                const isSubmitter = app.submittedByName.includes(
                  session?.name || ""
                );
                const isAdmin =
                  session?.permissions.includes("manage_spend_settings") ||
                  session?.permissions.includes("manage_users");
                const canEdit =
                  (isSubmitter || isAdmin) &&
                  app.status !== "approved" &&
                  app.status !== "completed";

                return (
                  <tr
                    key={app.id}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-medium max-w-[180px] truncate">
                      {app.projectName}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      R{app.estimatedAmount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {app.sourceOfFunds || "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {app.budgeted ? "Yes" : "No"}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {app.quoteDetails?.length || 0}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {app.submittedByName}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {app.submittedOnBehalf
                        ? `${app.applicantName} ${app.applicantSurname}`
                        : app.submittedByName}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(app.submittedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
                          statusColors[app.status] ||
                          "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {STATUS_DISPLAY[app.status] || app.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {app.status === "completed" ? (
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            app.finishedWithinBudget
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-risk-high/10 text-risk-high"
                          }`}
                        >
                          {app.finishedWithinBudget ? "YES" : "NO"}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/spend/${app.id}`}
                          className="text-primary hover:text-primary-dark text-xs font-medium"
                        >
                          View
                        </Link>
                        {canEdit && (
                          <Link
                            href={`/spend/${app.id}/edit`}
                            className="text-gray-500 hover:text-gray-700 text-xs font-medium"
                          >
                            Edit
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={11}
                    className="px-6 py-12 text-center text-gray-400"
                  >
                    No spend applications found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
