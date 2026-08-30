"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import SortableTh from "@/components/SortableTh";
import RowActions from "@/components/RowActions";
import ReminderModal from "@/components/ReminderModal";
import Toast from "@/components/Toast";
import { useTableSort, useColumnWidths } from "@/lib/useTable";

const STATUS_DISPLAY: Record<string, string> = {
  pending: "APPLIED",
  pending_decision: "PENDING DECISION",
  approved: "APPROVED",
  rejected: "DECLINED",
  requires_changes: "NEEDS MORE WORK",
  completed: "COMPLETED",
};

const STATUS_ORDER = [
  "pending",
  "pending_decision",
  "approved",
  "rejected",
  "requires_changes",
  "completed",
];

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
  applicantUserId?: string;
  applicantName?: string;
  applicantSurname?: string;
  submittedOnBehalf?: boolean;
  custodianUserId?: string;
  custodianName?: string;
  approvedAmount?: number;
  finishedWithinBudget?: boolean;
  quoteDetails?: { supplierName: string; priceExclVat?: number }[];
  notes?: { id: string }[];
  approvals: { userName: string; decision: string }[];
}

interface SpendSettings {
  capexBudget: number;
  capexYear: number;
}

interface DirectoryUser {
  id: string;
  name: string;
  surname: string;
  email: string;
}

// Mirrors getCustodian() on the server: an unset custodian follows the
// applicant, so every record shows one without a migration.
function custodianOf(app: SpendRecord): { userId?: string; name: string } {
  if (app.custodianUserId || app.custodianName) {
    return { userId: app.custodianUserId, name: app.custodianName || "" };
  }
  return {
    userId: app.applicantUserId,
    name: `${app.applicantName || ""} ${app.applicantSurname || ""}`.trim(),
  };
}

function applicantOf(app: SpendRecord): string {
  return app.submittedOnBehalf
    ? `${app.applicantName || ""} ${app.applicantSurname || ""}`.trim()
    : app.submittedByName;
}

const DEFAULT_WIDTHS: Record<string, number> = {
  projectName: 200,
  estimatedAmount: 120,
  sourceOfFunds: 130,
  budgeted: 90,
  quotes: 80,
  notes: 75,
  submittedByName: 140,
  applicant: 140,
  custodian: 170,
  submittedAt: 110,
  status: 170,
  finishedWithinBudget: 90,
  actions: 110,
};

export default function SpendPage() {
  const { session, loading } = useAuth("submit_spend");
  const [apps, setApps] = useState<SpendRecord[]>([]);
  const [settings, setSettings] = useState<SpendSettings | null>(null);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [filter, setFilter] = useState("all");
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [reminderFor, setReminderFor] = useState<SpendRecord | null>(null);

  const { sortKey, sortDir, toggle, sort } = useTableSort<SpendRecord>(
    "submittedAt",
    "desc"
  );
  const { widths, setWidth, reset } = useColumnWidths(
    "spend-grid-widths",
    DEFAULT_WIDTHS
  );

  const fetchData = useCallback(async () => {
    const [appsRes, settingsRes, usersRes] = await Promise.all([
      authFetch("/api/spend"),
      authFetch("/api/settings/spend"),
      authFetch("/api/users/directory"),
    ]);
    if (appsRes.ok) setApps(await appsRes.json());
    if (settingsRes.ok) setSettings(await settingsRes.json());
    if (usersRes.ok) setUsers(await usersRes.json());
  }, []);

  useEffect(() => {
    if (session) fetchData();
  }, [session, fetchData]);

  const isAdmin =
    (session?.permissions.includes("manage_spend_settings") ||
      session?.permissions.includes("manage_users")) ??
    false;
  const canImport =
    session?.permissions.includes("manage_spend_settings") ?? false;
  const canDelete = session?.permissions.includes("delete_spend") ?? false;
  // Editing status and custodian in the grid matches what the PATCH routes
  // enforce, so the control never appears where the save would be refused.
  const canEditInline =
    (session?.permissions.includes("approve_spend") ||
      session?.permissions.includes("manage_spend_settings")) ??
    false;

  const filtered = useMemo(
    () => (filter === "all" ? apps : apps.filter((a) => a.status === filter)),
    [apps, filter]
  );

  const sorted = useMemo(
    () =>
      sort(filtered, (app, key) => {
        switch (key) {
          case "quotes":
            return app.quoteDetails?.length || 0;
          case "notes":
            return app.notes?.length || 0;
          case "applicant":
            return applicantOf(app);
          case "custodian":
            return custodianOf(app).name;
          case "status":
            // Sort by workflow order rather than alphabetically, so the grid
            // reads Applied -> Pending -> Approved rather than A to Z.
            return STATUS_ORDER.indexOf(app.status);
          case "budgeted":
            return app.budgeted ? 1 : 0;
          case "finishedWithinBudget":
            return app.status === "completed"
              ? app.finishedWithinBudget
                ? 1
                : 0
              : undefined;
          default:
            return (app as unknown as Record<string, unknown>)[key];
        }
      }),
    [filtered, sort]
  );

  // Dashboard calculations
  const pendingCount = apps.filter(
    (a) => a.status === "pending" || a.status === "pending_decision"
  ).length;
  const totalPendingSpend = apps
    .filter((a) => a.status === "pending" || a.status === "pending_decision")
    .reduce((sum, a) => sum + a.estimatedAmount, 0);
  const totalApprovedSpend = apps
    .filter((a) => a.status === "approved" || a.status === "completed")
    .reduce((sum, a) => sum + (a.approvedAmount || 0), 0);
  const capexBudget = settings?.capexBudget || 0;
  const capexRemaining = capexBudget - totalApprovedSpend;
  const capexYear = settings?.capexYear || new Date().getFullYear();

  const statusColors: Record<string, string> = {
    pending: "bg-risk-low/10 text-risk-low",
    pending_decision: "bg-blue-50 text-blue-700",
    approved: "bg-emerald-100 text-emerald-700",
    rejected: "bg-risk-high/10 text-risk-high",
    requires_changes: "bg-risk-medium/10 text-risk-medium",
    completed: "bg-purple-100 text-purple-700",
  };

  // --- Inline edits -------------------------------------------------------
  // Each applies to local state first so the grid responds immediately, then
  // reverts to the previous value if the server refuses it.

  const patchRow = async (
    id: string,
    optimistic: Partial<SpendRecord>,
    url: string,
    body: Record<string, unknown>,
    failureMessage: string
  ) => {
    const previous = apps.find((a) => a.id === id);
    if (!previous) return;
    setApps((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...optimistic } : a))
    );

    const res = await authFetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      setApps((prev) => prev.map((a) => (a.id === id ? previous : a)));
      const data = await res.json().catch(() => ({}));
      setToast({ message: data.error || failureMessage, type: "error" });
      return;
    }
    // Take the server's version of the row back, so what the grid shows is
    // what was actually stored rather than what was clicked.
    const saved = await res.json().catch(() => null);
    if (saved) {
      setApps((prev) =>
        prev.map((a) =>
          a.id === id
            ? {
                ...a,
                ...(saved.status !== undefined
                  ? { status: saved.status }
                  : {}),
                // The server fills in approvedAmount when a row is approved
                // or completed, and the summary cards are computed from it.
                ...(saved.approvedAmount !== undefined
                  ? { approvedAmount: saved.approvedAmount }
                  : {}),
                ...(saved.custodianUserId !== undefined ||
                saved.custodianName !== undefined
                  ? {
                      custodianUserId: saved.custodianUserId,
                      custodianName: saved.custodianName,
                    }
                  : {}),
              }
            : a
        )
      );
    }
  };

  const changeStatus = (id: string, status: string) => {
    const app = apps.find((a) => a.id === id);
    // Mirror the server's backfill so the summary cards move immediately
    // rather than only after the response lands.
    const optimistic: Partial<SpendRecord> = { status };
    if (
      (status === "approved" || status === "completed") &&
      app &&
      app.approvedAmount === undefined
    ) {
      optimistic.approvedAmount = app.estimatedAmount;
    }
    return patchRow(
      id,
      optimistic,
      `/api/spend/${id}/status`,
      { status },
      "Could not change the status"
    );
  };

  const changeCustodian = (id: string, userId: string) => {
    const user = users.find((u) => u.id === userId);
    return patchRow(
      id,
      {
        custodianUserId: userId || undefined,
        custodianName: user ? `${user.name} ${user.surname}` : undefined,
      },
      `/api/spend/${id}/custodian`,
      { custodianUserId: userId },
      "Could not change the custodian"
    );
  };

  const handleDelete = async (app: SpendRecord) => {
    if (
      !confirm(
        `Delete "${app.projectName}"? This removes the project and its quotes permanently.`
      )
    ) {
      return;
    }
    const res = await authFetch(`/api/spend/${app.id}`, { method: "DELETE" });
    if (res.ok) {
      setApps((prev) => prev.filter((a) => a.id !== app.id));
      setToast({ message: `Deleted "${app.projectName}"`, type: "success" });
    } else {
      const data = await res.json().catch(() => ({}));
      setToast({
        message: data.error || "Could not delete that project",
        type: "error",
      });
    }
  };

  const handleCSVExport = () => {
    const headers = [
      "Project Name",
      "Est. Amount",
      "Source of Funds",
      "Budgeted",
      "# Quotes",
      "# Notes",
      "Submitted By",
      "Applicant",
      "Custodian",
      "Date",
      "Status",
      "Stuck to Budget",
    ];

    const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;

    const rows = sorted.map((app) => [
      quote(app.projectName),
      app.estimatedAmount,
      quote(app.sourceOfFunds || ""),
      app.budgeted ? "Yes" : "No",
      app.quoteDetails?.length || 0,
      app.notes?.length || 0,
      quote(app.submittedByName),
      quote(applicantOf(app)),
      quote(custodianOf(app).name),
      new Date(app.submittedAt).toLocaleDateString(),
      STATUS_DISPLAY[app.status] || app.status,
      app.status === "completed"
        ? app.finishedWithinBudget
          ? "YES"
          : "NO"
        : "",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `spend-projects-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="p-6">Loading...</div>;

  const th = (
    label: string,
    key: string,
    align?: "left" | "right" | "center",
    stickyLeft = false
  ) => (
    <SortableTh
      label={label}
      sortKey={key}
      activeKey={sortKey}
      dir={sortDir}
      onSort={toggle}
      width={widths[key]}
      onResize={setWidth}
      align={align}
      stickyTop
      stickyLeft={stickyLeft}
    />
  );

  return (
    <div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">Spend Projects</h1>
          <p className="text-gray-500 text-sm">
            {apps.length} project{apps.length !== 1 ? "s" : ""}
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
          <p className="text-xs text-gray-500">Total CAPEX {capexYear}</p>
          <p className="text-xl font-bold text-dark mt-1">
            R{capexBudget.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500">Pending Projects</p>
          <p className="text-xl font-bold text-risk-low mt-1">{pendingCount}</p>
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
      <div className="flex gap-2 mb-4 flex-wrap items-center">
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
        <button
          onClick={reset}
          className="ml-auto text-xs text-gray-400 hover:text-gray-600"
          title="Put the column widths back to their defaults"
        >
          Reset columns
        </button>
      </div>

      {/* Grid */}
      {/* The grid scrolls inside this box in both directions, which is what
          lets the header row and the Project column stay frozen. */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-auto max-h-[65vh]">
          <table className="w-full text-sm table-fixed border-separate border-spacing-0">
            <thead className="bg-gray-50">
              <tr>
                {th("Project", "projectName", "left", true)}
                {th("Est. Amount", "estimatedAmount")}
                {th("Source", "sourceOfFunds")}
                {th("Budgeted", "budgeted")}
                {th("Quotes", "quotes")}
                {th("Notes", "notes")}
                {th("Submitted By", "submittedByName")}
                {th("Applicant", "applicant")}
                {th("Custodian", "custodian")}
                {th("Date", "submittedAt")}
                {th("Status", "status")}
                {th("Budget", "finishedWithinBudget")}
                <SortableTh
                  label="Actions"
                  resizeKey="actions"
                  width={widths.actions}
                  onResize={setWidth}
                  align="right"
                />
              </tr>
            </thead>
            <tbody>
              {sorted.map((app) => {
                const custodian = custodianOf(app);
                // A custodian who is no longer a portal user must still appear
                // as an option, otherwise the select would silently show the
                // first user in the list instead.
                const custodianMissing =
                  !!custodian.userId &&
                  !users.some((u) => u.id === custodian.userId);

                return (
                  <tr
                    key={app.id}
                    className="group hover:bg-gray-50 [&>td]:border-b [&>td]:border-gray-100"
                  >
                    {/* Frozen alongside its header so the row stays
                        identifiable when the grid is scrolled sideways. It
                        carries its own background, so the row hover has to be
                        repeated here. */}
                    <td className="px-4 py-3 font-medium truncate sticky left-0 z-10 bg-white group-hover:bg-gray-50 border-r border-gray-200">
                      <Link
                        href={`/spend/${app.id}`}
                        className="hover:text-primary"
                        title={app.projectName}
                      >
                        {app.projectName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600 truncate">
                      R{app.estimatedAmount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs truncate">
                      {app.sourceOfFunds || "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {app.budgeted ? "Yes" : "No"}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {app.quoteDetails?.length || 0}
                    </td>
                    {/* Count only - the notes themselves live on the project. */}
                    <td className="px-4 py-3 text-xs">
                      {app.notes?.length ? (
                        <Link
                          href={`/spend/${app.id}`}
                          className="text-primary hover:underline font-medium"
                          title="View the notes on this project"
                        >
                          {app.notes.length}
                        </Link>
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs truncate">
                      {app.submittedByName}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs truncate">
                      {applicantOf(app)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {canEditInline ? (
                        <select
                          value={custodian.userId || ""}
                          onChange={(e) =>
                            changeCustodian(app.id, e.target.value)
                          }
                          className="w-full border border-transparent hover:border-gray-200 focus:border-primary rounded px-1 py-1 text-xs bg-transparent outline-none"
                        >
                          <option value="">Same as applicant</option>
                          {custodianMissing && (
                            <option value={custodian.userId}>
                              {custodian.name || "Former user"}
                            </option>
                          )}
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name} {u.surname}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-gray-600">
                          {custodian.name || "-"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs truncate">
                      {new Date(app.submittedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {canEditInline ? (
                        <select
                          value={app.status}
                          onChange={(e) =>
                            changeStatus(app.id, e.target.value)
                          }
                          className={`w-full rounded px-2 py-1 text-xs font-medium border border-transparent hover:border-gray-300 outline-none ${
                            statusColors[app.status] ||
                            "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {STATUS_ORDER.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_DISPLAY[s]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
                            statusColors[app.status] ||
                            "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {STATUS_DISPLAY[app.status] || app.status}
                        </span>
                      )}
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
                      <RowActions
                        actions={[
                          { label: "View", href: `/spend/${app.id}` },
                          ...(isAdmin &&
                          app.status !== "approved" &&
                          app.status !== "completed"
                            ? [
                                {
                                  label: "Edit",
                                  href: `/spend/${app.id}/edit`,
                                },
                              ]
                            : []),
                          ...(canEditInline
                            ? [
                                {
                                  label: "Set reminder",
                                  onClick: () => setReminderFor(app),
                                },
                              ]
                            : []),
                          ...(canDelete
                            ? [
                                {
                                  label: "Delete",
                                  onClick: () => handleDelete(app),
                                  danger: true,
                                },
                              ]
                            : []),
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={13}
                    className="px-6 py-12 text-center text-gray-400"
                  >
                    No spend projects found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {reminderFor && (
        <ReminderModal
          spendId={reminderFor.id}
          projectName={reminderFor.projectName}
          onClose={() => setReminderFor(null)}
          onSaved={(message, ok) =>
            setToast({ message, type: ok ? "success" : "error" })
          }
        />
      )}
    </div>
  );
}
