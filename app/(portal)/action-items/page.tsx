"use client";

import { useAuth, authFetch, apiErrorMessage } from "@/lib/useAuth";
import { useState, useEffect, useCallback, useMemo } from "react";
import SortableTh from "@/components/SortableTh";
import RowActions from "@/components/RowActions";
import Toast from "@/components/Toast";
import ActionItemForm from "@/components/ActionItemForm";
import ActionProgressModal from "@/components/ActionProgressModal";
import { useTableSort, useColumnWidths } from "@/lib/useTable";
import { GOVERNANCE_LABEL } from "@/lib/positions";
import {
  PRIORITY_LABELS,
  PRIORITY_PILL,
  PRIORITY_RANK,
  STATUS_LABELS,
  STATUS_PILL,
  STATUS_RANK,
  daysUntilDue,
  duePhrase,
  isClosed,
  isOverdue,
  nextReminderOn,
  summarise,
  todayIso,
  addDays,
} from "@/lib/actionItems";
import type { ActionItem } from "@/lib/actionItems";

export interface DirectoryPerson {
  id: string;
  position: string;
  name: string;
  email: string;
  hasLogin: boolean;
}

interface ReminderRun {
  at: string;
  due: number;
  sent: number;
  skipped: number;
  failed: number;
  detail: string[];
}

// Holding manage_people alongside the new key on purpose: a role record stored
// before manage_action_items existed will never gain it, so gating on the new
// key alone would lock today's administrators out of a page built for them.
// Mirrors ACTION_ADMIN_PERMISSIONS on the server.
const ADMIN_PERMISSIONS = ["manage_action_items", "manage_people"];

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "mine", label: "Mine" },
  { key: "overdue", label: "Overdue" },
  { key: "week", label: "Due in 7 days" },
  { key: "blocked", label: "Blocked" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" },
];

const DEFAULT_WIDTHS: Record<string, number> = {
  ref: 70,
  title: 260,
  assignees: 180,
  category: 130,
  priority: 90,
  dueDate: 150,
  progress: 150,
  status: 120,
  lastUpdate: 190,
  nextReminder: 140,
  actions: 110,
};

function ProgressBar({ percent }: { percent: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 w-9 text-right">{pct}%</span>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone = "text-dark",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold mt-1 ${tone}`}>{value}</p>
    </div>
  );
}

export default function ActionItemsPage() {
  // No permission to read: who agreed to do what belongs to everybody in the
  // portal, the same way the People register does. Raising and editing is
  // gated below.
  const { session, loading } = useAuth();
  const [items, setItems] = useState<ActionItem[]>([]);
  const [directory, setDirectory] = useState<DirectoryPerson[]>([]);
  const [runs, setRuns] = useState<ReminderRun[]>([]);
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ActionItem | null>(null);
  const [progressFor, setProgressFor] = useState<ActionItem | null>(null);
  const [busyId, setBusyId] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const { sortKey, sortDir, toggle, sort } = useTableSort<ActionItem>(
    "dueDate",
    "asc"
  );
  const { widths, setWidth, reset } = useColumnWidths(
    "hvps_action_items_widths",
    DEFAULT_WIDTHS
  );

  const canManage = !!session?.permissions.some((p) =>
    ADMIN_PERMISSIONS.includes(p)
  );

  const load = useCallback(async () => {
    const [itemsRes, dirRes] = await Promise.all([
      authFetch("/api/action-items", { cache: "no-store" }),
      authFetch("/api/people/directory", { cache: "no-store" }),
    ]);
    if (itemsRes.ok) setItems(await itemsRes.json());
    if (dirRes.ok) setDirectory(await dirRes.json());
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  useEffect(() => {
    if (!session || !canManage) return;
    (async () => {
      const res = await authFetch("/api/reminders/runs", { cache: "no-store" });
      if (res.ok) setRuns(await res.json());
    })();
  }, [session, canManage]);

  // The register entries that are this person.
  //
  // Matched on email rather than on a user id, because the directory does not
  // carry one: a linked account's own address is what it returns, which is the
  // same address the reminders resolve to. Normalised both sides, since one
  // pasted trailing space would silently empty the "Mine" tab.
  const myPersonIds = useMemo(() => {
    const mine = (session?.email || "").trim().toLowerCase();
    if (!mine) return [] as string[];
    return directory
      .filter((p) => (p.email || "").trim().toLowerCase() === mine)
      .map((p) => p.id);
  }, [directory, session?.email]);

  const summary = useMemo(() => summarise(items), [items]);

  const filtered = useMemo(() => {
    const today = todayIso();
    const weekOut = addDays(today, 7);
    const needle = search.trim().toLowerCase();

    return items.filter((item) => {
      if (needle) {
        const haystack = [
          item.ref,
          item.title,
          item.description,
          item.category,
          ...item.assigneeNames,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      switch (filter) {
        case "all":
          return true;
        case "open":
          return !isClosed(item);
        case "mine":
          return item.assigneeIds.some((id) => myPersonIds.includes(id));
        case "overdue":
          return isOverdue(item);
        case "week":
          return (
            !isClosed(item) &&
            !!item.dueDate &&
            item.dueDate >= today &&
            item.dueDate <= weekOut
          );
        case "blocked":
          return item.status === "blocked";
        case "done":
          return item.status === "done";
        default:
          return true;
      }
    });
  }, [items, filter, search, myPersonIds]);

  const sorted = useMemo(
    () =>
      sort(filtered, (item, key) => {
        switch (key) {
          case "ref":
            return item.ref;
          case "title":
            return item.title;
          case "assignees":
            return item.assigneeNames.join(", ");
          case "category":
            return item.category;
          case "priority":
            return PRIORITY_RANK[item.priority];
          case "dueDate":
            return item.dueDate;
          case "progress":
            return item.progress;
          case "status":
            return STATUS_RANK[item.status];
          case "lastUpdate":
            return item.updates[0]?.at || "";
          case "nextReminder":
            return nextReminderOn(item) || "";
          default:
            return "";
        }
      }),
    [filtered, sort]
  );

  const canUpdate = (item: ActionItem) =>
    canManage || item.assigneeIds.some((id) => myPersonIds.includes(id));

  const handleDelete = async (item: ActionItem) => {
    if (
      !confirm(
        `Delete ${item.ref} "${item.title}"? The reference will not be reused.`
      )
    ) {
      return;
    }
    const res = await authFetch(`/api/action-items/${item.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setToast({ message: `Deleted ${item.ref}`, type: "success" });
    } else {
      setToast({
        message: await apiErrorMessage(res, "Could not delete that action"),
        type: "error",
      });
    }
  };

  const handleRemindNow = async (item: ActionItem) => {
    const who = item.assigneeNames.filter(Boolean).join(", ") || "nobody";
    if (!confirm(`Send a reminder about ${item.ref} now, to ${who}?`)) return;

    setBusyId(item.id);
    const res = await authFetch(`/api/action-items/${item.id}/remind`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setBusyId("");

    if (res.ok) {
      const data = await res.json();
      setToast({
        message: `${item.ref}: ${data.result}`,
        type: data.sent > 0 ? "success" : "error",
      });
      load();
    } else {
      setToast({
        message: await apiErrorMessage(res, "Could not send that reminder"),
        type: "error",
      });
    }
  };

  const handleExport = () => {
    const headers = [
      "Ref",
      "Action",
      "Description",
      "Assigned to",
      "Category",
      "Priority",
      "ETA",
      "Progress %",
      "Status",
      "Last update",
      "Raised by",
    ];
    const quote = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = sorted.map((item) => [
      quote(item.ref),
      quote(item.title),
      quote(item.description),
      quote(item.assigneeNames.filter(Boolean).join("; ")),
      quote(item.category),
      quote(PRIORITY_LABELS[item.priority]),
      quote(item.dueDate),
      item.progress,
      quote(STATUS_LABELS[item.status]),
      quote(
        item.updates[0]
          ? `${new Date(item.updates[0].at).toLocaleDateString()} ${item.updates[0].byName}: ${item.updates[0].note}`
          : ""
      ),
      quote(item.raisedByName),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `action-items-${todayIso()}.csv`;
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

  const lastRun = runs[0];

  return (
    <div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-dark">Action Items</h1>
          <p className="text-gray-500 text-sm">
            What the {GOVERNANCE_LABEL} agreed to do, who is carrying it, and
            where it stands
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
          >
            Export to CSV
          </button>
          {canManage && (
            <button
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
              className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              + Add an action
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <SummaryTile label="Open" value={summary.open} />
        <SummaryTile
          label="Overdue"
          value={summary.overdue}
          tone="text-risk-high"
        />
        <SummaryTile
          label="Due in 7 days"
          value={summary.dueThisWeek}
          tone="text-risk-medium"
        />
        <SummaryTile
          label="Blocked"
          value={summary.blocked}
          tone="text-risk-high"
        />
        <SummaryTile
          label="Done"
          value={summary.done}
          tone="text-emerald-600"
        />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {FILTERS.map((f) => (
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
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search actions"
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
        />
        <button
          onClick={reset}
          className="ml-auto text-xs text-gray-400 hover:text-gray-600"
          title="Put the column widths back to their defaults"
        >
          Reset columns
        </button>
      </div>

      {showForm && (
        <ActionItemForm
          // Remounts when the form switches from one action to another, so the
          // fields cannot keep the previous row's values and save them over
          // the row now being edited.
          key={editing?.id || "new"}
          directory={directory}
          existing={editing}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={(message) => {
            setShowForm(false);
            setEditing(null);
            setToast({ message, type: "success" });
            load();
          }}
          onError={(message) => setToast({ message, type: "error" })}
        />
      )}

      {progressFor && (
        <ActionProgressModal
          item={progressFor}
          onClose={() => setProgressFor(null)}
          onSaved={(message) => {
            setProgressFor(null);
            setToast({ message, type: "success" });
            load();
          }}
          onError={(message) => setToast({ message, type: "error" })}
        />
      )}

      {/* The grid scrolls inside this box in both directions, which is what
          lets the header row and the Ref column stay frozen. */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-auto max-h-[65vh]">
          <table className="w-full text-sm table-fixed border-separate border-spacing-0">
            <thead className="bg-gray-50">
              <tr>
                {th("Ref", "ref", "left", true)}
                {th("Action", "title")}
                {th("Assigned to", "assignees")}
                {th("Category", "category")}
                {th("Priority", "priority")}
                {th("ETA", "dueDate")}
                {th("Progress", "progress")}
                {th("Status", "status")}
                {th("Last update", "lastUpdate")}
                {th("Next reminder", "nextReminder")}
                <SortableTh
                  label="Actions"
                  resizeKey="actions"
                  width={widths.actions}
                  onResize={setWidth}
                  align="right"
                  stickyTop
                />
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => {
                const daysLeft = daysUntilDue(item);
                const overdue = isOverdue(item);
                const nextChase = nextReminderOn(item);
                const lastUpdate = item.updates[0];

                const actions = [];
                if (canUpdate(item)) {
                  actions.push({
                    label: "Update progress",
                    onClick: () => setProgressFor(item),
                  });
                }
                if (canManage) {
                  actions.push({
                    label: "Edit",
                    onClick: () => {
                      setEditing(item);
                      setShowForm(true);
                    },
                  });
                  actions.push({
                    label: busyId === item.id ? "Sending..." : "Remind now",
                    onClick: () => handleRemindNow(item),
                  });
                  actions.push({
                    label: "Delete",
                    danger: true,
                    onClick: () => handleDelete(item),
                  });
                }

                return (
                  <tr
                    key={item.id}
                    className="group hover:bg-gray-50 [&>td]:border-b [&>td]:border-gray-100"
                  >
                    <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 border-r border-gray-100 px-4 py-3 font-medium text-gray-500 align-top">
                      {item.ref}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="font-medium text-dark">{item.title}</p>
                      {item.description && (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                          {item.description}
                        </p>
                      )}
                      {item.meetingDate && (
                        <p className="text-xs text-gray-400 mt-1">
                          Raised at the meeting of {item.meetingDate}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-gray-600">
                      {item.assigneeNames.filter(Boolean).join(", ") || (
                        <span className="text-risk-medium text-xs">
                          Nobody assigned
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-gray-600 text-xs">
                      {item.category}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_PILL[item.priority]}`}
                      >
                        {PRIORITY_LABELS[item.priority]}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {item.dueDate ? (
                        <>
                          <p className="text-gray-600">{item.dueDate}</p>
                          <p
                            className={`text-xs mt-0.5 ${
                              overdue
                                ? "text-risk-high font-medium"
                                : "text-gray-400"
                            }`}
                          >
                            {isClosed(item)
                              ? STATUS_LABELS[item.status]
                              : duePhrase(item.dueDate, daysLeft)}
                          </p>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">
                          No date set
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <ProgressBar percent={item.progress} />
                      {item.progress === 100 && item.status !== "done" && (
                        <p className="text-xs text-amber-600 mt-1">
                          Awaiting sign-off
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_PILL[item.status]}`}
                      >
                        {STATUS_LABELS[item.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-gray-500">
                      {lastUpdate ? (
                        <>
                          <span className="block text-gray-600">
                            {new Date(lastUpdate.at).toLocaleDateString()}
                            {" "}
                            {lastUpdate.byName}
                          </span>
                          {lastUpdate.note && (
                            <span className="block text-gray-400 line-clamp-2">
                              {lastUpdate.note}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">
                          Nothing reported yet
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-xs">
                      {nextChase ? (
                        <span className="text-gray-600">{nextChase}</span>
                      ) : (
                        <span className="text-gray-400">
                          {isClosed(item)
                            ? "Closed"
                            : item.reminder?.enabled === false
                              ? "Reminders off"
                              : !item.dueDate
                                ? "Needs an ETA"
                                : "No further chase"}
                        </span>
                      )}
                      {item.lastReminderResult && (
                        <span className="block text-gray-400 mt-0.5">
                          Last: {item.lastReminderResult}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      {actions.length > 0 ? (
                        <RowActions actions={actions} />
                      ) : (
                        <span className="text-xs text-gray-300">View only</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={11}
                    className="px-6 py-12 text-center text-gray-400"
                  >
                    {items.length === 0
                      ? canManage
                        ? "No actions yet. Add the first one from the button above."
                        : "No actions have been raised yet."
                      : "Nothing matches that filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {canManage && (
        <div className="mt-4 text-xs text-gray-400">
          {lastRun ? (
            <>
              Reminder run {new Date(lastRun.at).toLocaleString()}:{" "}
              {lastRun.due} due, {lastRun.sent} sent
              {lastRun.failed > 0 ? `, ${lastRun.failed} failed` : ""}. Chases go
              out once a day.
            </>
          ) : (
            <>
              The daily reminder job has not recorded a run yet. A cron that has
              never fired and one that fires with nothing to send look the same
              until it does.
            </>
          )}
        </div>
      )}
    </div>
  );
}
