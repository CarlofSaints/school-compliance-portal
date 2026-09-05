"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth, authFetch } from "@/lib/useAuth";
import type { ActivityEntry, ActivityEntity } from "@/lib/activityLog";

// The school's own audit trail. Carl sees the same thing per school from the
// admin portal, deliberately: a school that can be shown its own record trusts
// the record, and there is nothing here it should not see about itself.

const ENTITY_LABELS: Record<ActivityEntity | "all", string> = {
  all: "Everything",
  spend: "Funding & spend",
  policy: "Policies",
  document: "Documents",
  user: "Users",
  role: "Roles & permissions",
  person: "People register",
  action_item: "Action items",
  minutes: "Minutes",
  compliance: "Compliance checks",
  branding: "Branding",
  auth: "Sign in",
  system: "System",
};

// Funding decisions are the reason this log exists, so they are coloured to be
// findable by eye in a long list rather than only by filtering.
function toneFor(action: string): string {
  if (action.startsWith("spend.approved")) return "text-emerald-700 bg-emerald-50";
  if (action.startsWith("spend.rejected")) return "text-risk-high bg-red-50";
  if (action.includes("override")) return "text-amber-800 bg-amber-50";
  if (action.startsWith("spend.")) return "text-primary bg-gray-50";
  return "text-gray-600 bg-gray-50";
}

function whenLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function monthLabel(m: string): string {
  const [y, mm] = m.split("-");
  return new Date(Number(y), Number(mm) - 1, 1).toLocaleDateString("en-ZA", {
    month: "long",
    year: "numeric",
  });
}

const PAGE_SIZE = 100;

export default function ActivityPage() {
  // ANY-of, matching the API. A narrow new key on its own would lock out every
  // existing admin, because a stored role never gains a permission added later.
  const { session, loading } = useAuth([
    "view_activity",
    "manage_users",
    "manage_roles",
    "manage_spend_settings",
  ]);

  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [months, setMonths] = useState<string[]>([]);
  const [month, setMonth] = useState<string>("");
  const [entity, setEntity] = useState<ActivityEntity | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      const qs = new URLSearchParams();
      if (month) qs.set("month", month);
      if (entity !== "all") qs.set("entity", entity);
      if (search.trim()) qs.set("search", search.trim());
      qs.set("limit", String(PAGE_SIZE));
      qs.set("offset", String(page * PAGE_SIZE));

      const res = await authFetch(`/api/activity?${qs}`);
      if (!res.ok) return;
      const data = await res.json();
      setEntries(data.entries || []);
      setTotal(data.total || 0);
      setMonths(data.availableMonths || []);
      if (!month && data.month) setMonth(data.month);
    } finally {
      setBusy(false);
    }
  }, [session, month, entity, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Any change of filter has to reset the page, or somebody on page 3 of a
  // wide view lands on an empty page of a narrow one and thinks it is broken.
  const changeFilter = (fn: () => void) => {
    setPage(0);
    fn();
  };

  if (loading || !session) return null;

  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark">Activity log</h1>
          <p className="text-gray-500 mt-1">
            Every action taken in this portal, who took it and when. Kept as a
            record for audits.
          </p>
        </div>
        <a
          href={`/api/activity?format=csv&month=${month}`}
          className="bg-primary hover:bg-primary-dark text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          Export this month
        </a>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3">
        <select
          value={month}
          onChange={(e) => changeFilter(() => setMonth(e.target.value))}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary"
        >
          {months.length === 0 && <option value={month}>{month || "This month"}</option>}
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>

        <select
          value={entity}
          onChange={(e) => changeFilter(() => setEntity(e.target.value as ActivityEntity | "all"))}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary"
        >
          {Object.entries(ENTITY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <input
          type="search"
          value={search}
          onChange={(e) => changeFilter(() => setSearch(e.target.value))}
          placeholder="Search what happened, or who did it"
          className="flex-1 min-w-[220px] px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500 w-36">When</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 w-44">Who</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">What happened</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 w-40">Type</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {entries.map((e) => (
              <RowPair key={e.id} entry={e} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} />
            ))}
            {entries.length === 0 && !busy && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                  {search || entity !== "all"
                    ? "Nothing matches those filters this month."
                    : "Nothing recorded this month yet."}
                </td>
              </tr>
            )}
            {busy && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-gray-500">
            {total.toLocaleString()} entries. Page {page + 1} of {pages}.
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40"
            >
              Newer
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
              disabled={page >= pages - 1}
              className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40"
            >
              Older
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RowPair({
  entry,
  open,
  onToggle,
}: {
  entry: ActivityEntry;
  open: boolean;
  onToggle: () => void;
}) {
  const hasDetail = entry.detail && Object.keys(entry.detail).length > 0;
  return (
    <>
      <tr
        className={hasDetail ? "hover:bg-gray-50 cursor-pointer" : ""}
        onClick={hasDetail ? onToggle : undefined}
      >
        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{whenLabel(entry.at)}</td>
        <td className="px-4 py-3">
          <div className="text-dark">{entry.actorName}</div>
          {entry.actorEmail && (
            <div className="text-xs text-gray-400">{entry.actorEmail}</div>
          )}
        </td>
        <td className="px-4 py-3 text-gray-700">{entry.summary}</td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-1 rounded ${toneFor(entry.action)}`}>
            {ENTITY_LABELS[entry.entity] || entry.entity}
          </span>
        </td>
        <td className="px-4 py-3 text-gray-300 text-xs">{hasDetail ? (open ? "▾" : "▸") : ""}</td>
      </tr>
      {open && hasDetail && (
        <tr className="bg-gray-50">
          <td colSpan={5} className="px-4 py-4">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-xs">
              {Object.entries(entry.detail!).map(([k, v]) =>
                v === undefined || v === null || v === "" ? null : (
                  <div key={k} className="flex gap-2">
                    <dt className="text-gray-500 shrink-0">{k}:</dt>
                    <dd className="text-gray-800 break-all">
                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </dd>
                  </div>
                )
              )}
              <div className="flex gap-2">
                <dt className="text-gray-500 shrink-0">action:</dt>
                <dd className="text-gray-800 font-mono">{entry.action}</dd>
              </div>
              {entry.ip && (
                <div className="flex gap-2">
                  <dt className="text-gray-500 shrink-0">from:</dt>
                  <dd className="text-gray-800 font-mono">{entry.ip}</dd>
                </div>
              )}
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}
