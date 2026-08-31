"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback } from "react";
import Toast from "@/components/Toast";
import { REQUIRED_POLICY_CATEGORY } from "@/lib/policyCategories";

export default function PolicyCategoriesPage() {
  const { session, loading } = useAuth("manage_policies");
  const [categories, setCategories] = useState<string[]>([]);
  // How many policies sit in each category, so a category is never removed
  // without seeing what it would leave behind.
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const load = useCallback(async () => {
    const [catsRes, policiesRes] = await Promise.all([
      authFetch("/api/settings/policy-categories"),
      authFetch("/api/policies"),
    ]);

    let list: string[] = [];
    if (catsRes.ok) {
      const data = await catsRes.json();
      if (Array.isArray(data)) list = data;
    }

    const counts: Record<string, number> = {};
    if (policiesRes.ok) {
      const policies = await policiesRes.json();
      if (Array.isArray(policies)) {
        for (const p of policies) {
          const c = String(p.category || "");
          if (!c) continue;
          counts[c] = (counts[c] || 0) + 1;
        }
      }
    }

    // A category that policies are filed under but which is not on the list —
    // removed at some point, or typed before the list existed — is shown so it
    // can be seen and kept or cleaned up, rather than being invisible.
    for (const used of Object.keys(counts)) {
      if (!list.includes(used)) list = [...list, used];
    }

    setCategories(list);
    setUsage(counts);
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  const rename = (index: number, value: string) => {
    setCategories((prev) => prev.map((c, i) => (i === index ? value : c)));
    setDirty(true);
  };

  const remove = (index: number) => {
    setCategories((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  };

  const add = () => {
    const value = adding.trim();
    if (!value) return;
    if (categories.some((c) => c.toLowerCase() === value.toLowerCase())) {
      setToast({ message: `"${value}" is already on the list`, type: "error" });
      return;
    }
    setCategories((prev) => [...prev, value]);
    setAdding("");
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    const res = await authFetch("/api/settings/policy-categories", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categories }),
    });
    setSaving(false);
    if (res.ok) {
      const saved = await res.json();
      if (Array.isArray(saved)) setCategories(saved);
      setDirty(false);
      setToast({ message: "Policy categories saved", type: "success" });
    } else {
      setToast({ message: "Could not save the categories", type: "error" });
    }
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
          <h1 className="text-2xl font-bold text-dark">Policy Categories</h1>
          <p className="text-gray-500 text-sm">
            How policies are filed in the repository
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
          {categories.map((category, i) => {
            const inUse = usage[category] || 0;
            const required =
              category.toLowerCase() ===
              REQUIRED_POLICY_CATEGORY.toLowerCase();
            return (
              <div key={i} className="flex items-center gap-3">
                <input
                  type="text"
                  value={category}
                  onChange={(e) => rename(i, e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
                <span className="text-xs text-gray-400 w-28 text-right">
                  {inUse === 0
                    ? "not used"
                    : `${inUse} ${inUse === 1 ? "policy" : "policies"}`}
                </span>
                {required ? (
                  <span
                    className="text-xs text-gray-400 w-16 text-right"
                    title="Used when a policy is uploaded without a category, so it cannot be removed"
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

        <p className="text-xs text-gray-400 mt-4">
          Removing a category does not change the policies already filed under
          it — they keep it, and it stays on their dropdown until you move them.
          Renaming one here does not rename it on those policies either; change
          them on the Policies page.
        </p>
      </div>
    </div>
  );
}
