"use client";

import { useAuth, authFetch, apiErrorMessage } from "@/lib/useAuth";
import { useState, useEffect, useCallback } from "react";
import Toast from "@/components/Toast";
import { REQUIRED_ACTION_CATEGORY } from "@/lib/actionItems";

// Mirrors ACTION_ADMIN_PERMISSIONS on the server.
const ADMIN_PERMISSIONS = ["manage_action_items", "manage_people"];

// `original` is the name the row had when the page loaded, or null for a row
// added here. Comparing the two is how a rename is told apart from a remove
// plus an add, which matters because a rename moves the actions with it.
interface Row {
  original: string | null;
  value: string;
}

// A removed category that actions still use, and where they are going.
interface Removed {
  name: string;
  moveTo: string;
}

const isRequired = (name: string) =>
  name.trim().toLowerCase() === REQUIRED_ACTION_CATEGORY.toLowerCase();

export default function ActionCategoriesPage() {
  const { session, loading } = useAuth(ADMIN_PERMISSIONS);
  const [rows, setRows] = useState<Row[]>([]);
  // How many actions sit in each category, so a category is never removed
  // without seeing what it would leave behind.
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [removed, setRemoved] = useState<Removed[]>([]);
  const [adding, setAdding] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const load = useCallback(async () => {
    const [catsRes, itemsRes] = await Promise.all([
      authFetch("/api/settings/action-categories", { cache: "no-store" }),
      authFetch("/api/action-items", { cache: "no-store" }),
    ]);

    let list: string[] = [];
    if (catsRes.ok) {
      const data = await catsRes.json();
      if (Array.isArray(data)) list = data;
    }

    const counts: Record<string, number> = {};
    if (itemsRes.ok) {
      const items = await itemsRes.json();
      if (Array.isArray(items)) {
        for (const item of items) {
          const c = String(item.category || "");
          if (!c) continue;
          counts[c] = (counts[c] || 0) + 1;
        }
      }
    }

    // A category that actions are filed under but which is not on the list is
    // shown, so it can be kept, renamed or cleared rather than being invisible.
    for (const used of Object.keys(counts)) {
      if (!list.includes(used)) list = [...list, used];
    }

    setRows(list.map((c) => ({ original: c, value: c })));
    setUsage(counts);
    setRemoved([]);
    setDirty(false);
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  const names = rows.map((r) => r.value.trim()).filter(Boolean);

  const rename = (index: number, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, value } : r)));
    setDirty(true);
  };

  const remove = (index: number) => {
    const row = rows[index];
    setRows((prev) => prev.filter((_, i) => i !== index));
    if (row.original && (usage[row.original] || 0) > 0) {
      setRemoved((prev) => [
        ...prev,
        { name: row.original!, moveTo: REQUIRED_ACTION_CATEGORY },
      ]);
    }
    setDirty(true);
  };

  const add = () => {
    const value = adding.trim();
    if (!value) return;
    if (names.some((c) => c.toLowerCase() === value.toLowerCase())) {
      setToast({ message: `"${value}" is already on the list`, type: "error" });
      return;
    }
    setRows((prev) => [...prev, { original: null, value }]);
    setAdding("");
    setDirty(true);
  };

  const save = async () => {
    const renames = [
      ...rows
        .filter((r) => r.original && r.value.trim() && r.value.trim() !== r.original)
        .map((r) => ({ from: r.original!, to: r.value.trim() })),
      // A move target that was itself removed falls back to the required one,
      // which is what its dropdown is showing.
      ...removed.map((r) => ({
        from: r.name,
        to: names.includes(r.moveTo) ? r.moveTo : REQUIRED_ACTION_CATEGORY,
      })),
    ];

    setSaving(true);
    const res = await authFetch("/api/settings/action-categories", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categories: names, renames }),
    });
    setSaving(false);

    if (!res.ok) {
      setToast({
        message: await apiErrorMessage(res, "Could not save the categories"),
        type: "error",
      });
      return;
    }

    const { moved } = await res.json();
    setToast({
      message:
        moved > 0
          ? `Action categories saved, and ${moved} ${moved === 1 ? "action" : "actions"} moved to the new name`
          : "Action categories saved",
      type: "success",
    });
    // Reloaded so the usage counts reflect the actions that just moved.
    await load();
  };

  if (loading) return <div className="p-6">Loading...</div>;

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
          <h1 className="text-2xl font-bold text-dark">Action Categories</h1>
          <p className="text-gray-500 text-sm">
            The categories an action item can be filed under
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="bg-primary hover:bg-primary-dark disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? "Saving..." : dirty ? "Save Changes" : "Saved"}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 max-w-2xl">
        <div className="space-y-2">
          {rows.map((row, i) => {
            const inUse = row.original ? usage[row.original] || 0 : 0;
            const renamed =
              !!row.original && row.value.trim() !== row.original;
            return (
              <div key={i}>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={row.value}
                    onChange={(e) => rename(i, e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  />
                  <span className="text-xs text-gray-400 w-28 text-right">
                    {row.original === null
                      ? "new"
                      : inUse === 0
                        ? "not used"
                        : `${inUse} ${inUse === 1 ? "action" : "actions"}`}
                  </span>
                  {row.original && isRequired(row.original) ? (
                    <span
                      className="text-xs text-gray-400 w-16 text-right"
                      title="Used when an action is raised or imported without a category, so it cannot be removed"
                    >
                      required
                    </span>
                  ) : (
                    <button
                      onClick={() => remove(i)}
                      className="text-risk-high hover:text-red-700 text-xs font-medium w-16 text-right"
                    >
                      Remove
                    </button>
                  )}
                </div>
                {renamed && inUse > 0 && row.value.trim() && (
                  <p className="text-xs text-amber-600 mt-1">
                    Was &quot;{row.original}&quot;. Saving moves its {inUse}{" "}
                    {inUse === 1 ? "action" : "actions"} to &quot;
                    {row.value.trim()}&quot;.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
          <input
            type="text"
            value={adding}
            placeholder="Add a category..."
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
          />
          <button
            onClick={add}
            className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Add
          </button>
        </div>

        {removed.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
            <p className="text-xs font-medium text-gray-600">
              Removed categories that actions still use
            </p>
            {removed.map((r, i) => {
              const count = usage[r.name] || 0;
              return (
                <div key={r.name} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 text-gray-600">
                    Move the {count} {count === 1 ? "action" : "actions"} in
                    &quot;{r.name}&quot; to
                  </span>
                  <select
                    value={names.includes(r.moveTo) ? r.moveTo : REQUIRED_ACTION_CATEGORY}
                    onChange={(e) => {
                      const moveTo = e.target.value;
                      setRemoved((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, moveTo } : x))
                      );
                    }}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                  >
                    {names.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4">
          Renaming a category moves every action filed under it to the new name.
          Removing one that actions use asks where to move them. Nothing changes
          until you click Save Changes.
        </p>
      </div>
    </div>
  );
}
