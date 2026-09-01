"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback } from "react";
import { GOVERNANCE_LABEL } from "@/lib/positions";
import Toast from "@/components/Toast";

interface Usage {
  people: string[];
  approvals: { id: string; projectName: string; where: string }[];
}

interface Orphan extends Usage {
  name: string;
}

export default function PositionsPage() {
  const { session, loading } = useAuth("manage_people");
  const [positions, setPositions] = useState<string[]>([]);
  const [usage, setUsage] = useState<Record<string, Usage>>({});
  const [orphans, setOrphans] = useState<Orphan[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const fetchData = useCallback(async () => {
    const res = await authFetch("/api/settings/positions?usage=1", {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      setPositions(data.positions || []);
      setUsage(data.usage || {});
      setOrphans(data.orphans || []);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (session) fetchData();
  }, [session, fetchData]);

  // Every write goes through here so the list, the usage counts and the error
  // handling stay identical across add, rename, reorder and remove.
  const send = async (
    init: RequestInit & { url: string },
    okMessage: (data: Record<string, unknown>) => string
  ) => {
    setBusy(true);
    const { url, ...options } = init;
    const res = await authFetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setToast({ message: okMessage(data), type: "success" });
      await fetchData();
    } else {
      setToast({
        message: (data as { error?: string }).error || "That did not work.",
        type: "error",
      });
    }
    setBusy(false);
    return res.ok;
  };

  const add = async () => {
    const name = adding.trim();
    if (!name) return;
    const ok = await send(
      {
        url: "/api/settings/positions",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      },
      () => `"${name}" added.`
    );
    if (ok) setAdding("");
  };

  const rename = async (from: string) => {
    const to = draft.trim();
    if (!to || to === from) {
      setEditing(null);
      return;
    }
    const ok = await send(
      {
        url: "/api/settings/positions",
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      },
      (d) =>
        `Renamed to "${to}".` +
        (typeof d.moved === "number" && d.moved > 0
          ? ` ${d.moved} ${d.moved === 1 ? "person was" : "people were"} moved across.`
          : "")
    );
    if (ok) setEditing(null);
  };

  const remove = async (name: string) => {
    if (!confirm(`Remove "${name}" from the list of positions?`)) return;
    await send(
      {
        url: `/api/settings/positions?name=${encodeURIComponent(name)}`,
        method: "DELETE",
      },
      () => `"${name}" removed.`
    );
  };

  const move = async (index: number, by: -1 | 1) => {
    const next = [...positions];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await send(
      {
        url: "/api/settings/positions",
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: next }),
      },
      () => "Order saved."
    );
  };

  const restoreOrphan = async (name: string) => {
    await send(
      {
        url: "/api/settings/positions",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      },
      () => `"${name}" put back on the list.`
    );
  };

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div>
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">People Types</h1>
        <p className="text-gray-500 text-sm">
          The {GOVERNANCE_LABEL} positions somebody on the register can hold. This
          list also sets the order the People page reads in.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6 max-w-2xl">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Add a position
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="e.g. Health and Safety Officer"
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
          />
          <button
            onClick={add}
            disabled={busy || !adding.trim()}
            className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {orphans.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 max-w-3xl">
          <p className="text-sm font-medium text-amber-900">
            In use but not on the list
          </p>
          <p className="text-xs text-amber-800 mt-1">
            These positions are on somebody&rsquo;s record or in an approval, but
            are not offered when adding a person. Put one back, or move the
            people on it to a position that is on the list.
          </p>
          <div className="mt-3 space-y-2">
            {orphans.map((o) => (
              <div key={o.name} className="flex items-center justify-between gap-3">
                <span className="text-sm text-amber-900">
                  {o.name}
                  <span className="text-amber-700 text-xs">
                    {" "}
                    &middot; {o.people.length} on the register, {o.approvals.length} in approvals
                  </span>
                </span>
                <button
                  onClick={() => restoreOrphan(o.name)}
                  disabled={busy}
                  className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 transition-colors disabled:opacity-50"
                >
                  Put back
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loaded ? (
        <p className="text-sm text-gray-500">Loading positions...</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden max-w-3xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-left text-gray-500">
                <th className="px-4 py-3 font-medium w-16">Order</th>
                <th className="px-4 py-3 font-medium">Position</th>
                <th className="px-4 py-3 font-medium">In use</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((name, i) => {
                const u = usage[name] || { people: [], approvals: [] };
                const inApprovals = u.approvals.length > 0;
                const held = u.people.length > 0;
                const lockedReason = inApprovals
                  ? "This position is part of the approval record on a fund application, so it cannot be renamed or removed."
                  : held
                  ? "Someone on the register holds this position. It can be renamed, and they move with it, but it cannot be removed."
                  : "";

                return (
                  <tr key={name} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => move(i, -1)}
                          disabled={busy || i === 0}
                          aria-label={`Move ${name} up`}
                          className="w-6 h-6 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => move(i, 1)}
                          disabled={busy || i === positions.length - 1}
                          aria-label={`Move ${name} down`}
                          className="w-6 h-6 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors"
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {editing === name ? (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={draft}
                            autoFocus
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                rename(name);
                              }
                              if (e.key === "Escape") setEditing(null);
                            }}
                            className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                          />
                          <button
                            onClick={() => rename(name)}
                            disabled={busy}
                            className="text-primary text-xs font-medium hover:underline disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            className="text-gray-500 text-xs hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <span className="font-medium text-dark">{name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {!held && !inApprovals ? (
                        <span className="text-gray-300">Not used</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {held && (
                            <span
                              className="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700"
                              title={u.people.join(", ")}
                            >
                              {u.people.length} on the register
                            </span>
                          )}
                          {inApprovals && (
                            <span
                              className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800"
                              title={[
                                ...new Set(u.approvals.map((a) => a.projectName)),
                              ].join(", ")}
                            >
                              {u.approvals.length} in approvals
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {editing !== name && (
                        <>
                          <button
                            onClick={() => {
                              setEditing(name);
                              setDraft(name);
                            }}
                            disabled={busy || inApprovals}
                            title={inApprovals ? lockedReason : undefined}
                            className="text-primary text-xs font-medium hover:underline disabled:text-gray-300 disabled:no-underline disabled:cursor-not-allowed"
                          >
                            Rename
                          </button>
                          <button
                            onClick={() => remove(name)}
                            disabled={busy || inApprovals || held}
                            title={lockedReason || undefined}
                            className="ml-3 text-risk-high text-xs font-medium hover:underline disabled:text-gray-300 disabled:no-underline disabled:cursor-not-allowed"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 max-w-3xl rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm font-medium text-dark">Why some cannot be changed</p>
        <p className="text-xs text-gray-500 mt-1">
          When a fund application is submitted, the people who have to approve it
          are frozen onto the record, and each decision stores the position the
          approver held at the time. Those are the school&rsquo;s record of who
          authorised spending. A position that appears in one cannot be renamed
          or removed, or the record would describe a role that no longer exists.
          A position somebody merely holds can still be renamed, and they move
          with it.
        </p>
      </div>
    </div>
  );
}
