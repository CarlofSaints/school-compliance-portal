"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback } from "react";
import PolicySearch from "@/components/PolicySearch";
import ComplianceScore from "@/components/ComplianceScore";
import ScoreNote from "@/components/ScoreNote";
import Link from "next/link";
import { categoryOptions } from "@/lib/policyCategories";

// Reads the name the server gave the file back out of Content-Disposition,
// preferring the RFC 6266 filename* the download route sends, since that is
// the one that survives characters HTTP headers cannot carry.
function filenameFrom(res: Response): string | null {
  const header = res.headers.get("Content-Disposition") || "";
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      // Fall through to the plain filename.
    }
  }
  const plain = header.match(/filename="([^"]+)"/i);
  return plain ? plain[1] : null;
}

interface PolicyRecord {
  id: string;
  name: string;
  description: string;
  category: string;
  currentVersion: number;
  lastCheckScore: number | null;
  lastCheckDate: string | null;
  updatedAt: string;
}

export default function PoliciesPage() {
  const { session, loading } = useAuth("download_policies");
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [filtered, setFiltered] = useState<PolicyRecord[]>([]);
  const [repairing, setRepairing] = useState(false);
  const [savingCategory, setSavingCategory] = useState<string | null>(null);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  const fetchPolicies = useCallback(async () => {
    const res = await authFetch("/api/policies");
    if (res.ok) {
      const data = await res.json();
      setPolicies(data);
      setFiltered(data);
    }
  }, []);

  // The school's category list, managed in Admin > Policy Categories.
  const fetchCategories = useCallback(async () => {
    const res = await authFetch("/api/settings/policy-categories");
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data)) setAllCategories(data);
  }, []);

  useEffect(() => {
    if (session) {
      fetchPolicies();
      fetchCategories();
    }
  }, [session, fetchPolicies, fetchCategories]);

  // Saves a category straight from the grid. The row is updated first so the
  // dropdown does not snap back while the request is in flight, and put back
  // if the save fails — a control that keeps the value it could not store is
  // worse than one that visibly refuses it.
  const changeCategory = async (policyId: string, category: string) => {
    const previous = policies.find((p) => p.id === policyId)?.category;
    if (previous === undefined || previous === category) return;

    // The grid renders `filtered`, so both lists have to move together or the
    // visible row keeps the old value.
    const apply = (value: string) => {
      const patch = (list: PolicyRecord[]) =>
        list.map((p) => (p.id === policyId ? { ...p, category: value } : p));
      setPolicies(patch);
      setFiltered(patch);
    };

    apply(category);
    setSavingCategory(policyId);
    setNotice(null);

    const res = await authFetch(`/api/policies/${policyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    });

    if (!res.ok) {
      apply(previous);
      setNotice("That category could not be saved. It has been put back.");
    }
    setSavingCategory(null);
  };

  // Saves the current version of a policy to the reader's machine.
  //
  // Fetched and saved as a blob rather than linked to directly: the session is
  // carried in an x-user-id header, which a plain <a href download> does not
  // send, so the browser would get a 401 and report it as "file wasn't
  // available on site".
  const downloadPolicy = async (policy: PolicyRecord) => {
    setDownloading(policy.id);
    setNotice(null);
    try {
      const res = await authFetch(`/api/policies/${policy.id}/download`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setNotice(err.error || "That policy could not be downloaded.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // The server names the file too; this is what the browser uses for a
      // blob URL, so it has to be set here as well.
      a.download = filenameFrom(res) || policy.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  };

  // Runs the compliance check on a policy's current version straight from the
  // grid, so a whole repository can be worked through without opening each
  // policy in turn.
  //
  // The check reads the file and calls the model, so it can take up to two
  // minutes. Several rows are allowed to run at once, which is why this tracks
  // a set of ids rather than the single id the instant actions use.
  const runCheck = async (policy: PolicyRecord) => {
    setCheckingIds((ids) => new Set(ids).add(policy.id));
    setNotice(null);
    try {
      const res = await authFetch(`/api/policies/${policy.id}/check`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setNotice(
          `${policy.name}: ${err.error || "the compliance check could not be run."}`
        );
        return;
      }
      const check = await res.json();

      // Both lists again — the grid renders `filtered`, so a score written to
      // `policies` alone would not appear until the next search.
      const patch = (list: PolicyRecord[]) =>
        list.map((p) =>
          p.id === policy.id
            ? {
                ...p,
                lastCheckScore: check.score,
                lastCheckDate: check.checkedAt,
              }
            : p
        );
      setPolicies(patch);
      setFiltered(patch);

      const risks = (check.risks || []).length;
      setNotice(
        `${policy.name} scored ${check.score} out of 100. ${risks} ${
          risks === 1 ? "risk was" : "risks were"
        } found, open the policy to read them.`
      );
    } catch {
      setNotice(`${policy.name}: the compliance check could not be run.`);
    } finally {
      setCheckingIds((ids) => {
        const next = new Set(ids);
        next.delete(policy.id);
        return next;
      });
    }
  };

  // Puts back any policy whose file is in storage but whose index entry was
  // lost. Only ever adds, so it is safe to press at any time.
  const repairIndex = async () => {
    setRepairing(true);
    setNotice(null);
    const res = await authFetch("/api/policies/repair-index", {
      method: "POST",
    });
    if (res.ok) {
      const result = await res.json();
      const secured = result.backfilled
        ? ` ${result.backfilled} existing ${
            result.backfilled === 1 ? "policy is" : "policies are"
          } now stored so they can be restored in full if the list ever loses them.`
        : "";
      // Only a policy restored from a filename needs its details checked; one
      // restored from its own stored copy came back complete.
      const needsCheck = (result.policies || []).filter(
        (p: { fromMeta: boolean }) => !p.fromMeta
      );
      setNotice(
        result.recovered === 0
          ? `Nothing missing. Every policy in storage is already listed.${secured}`
          : `Recovered ${result.recovered} ${
              result.recovered === 1 ? "policy" : "policies"
            }: ${result.policies
              .map((p: { name: string }) => p.name)
              .join(", ")}.${
              needsCheck.length
                ? ` Check the name and category on ${needsCheck
                    .map((p: { name: string }) => p.name)
                    .join(", ")}, rebuilt from the filename.`
                : ""
            }${secured}`
      );
      fetchPolicies();
    } else {
      setNotice("Could not rebuild the list. Try again.");
    }
    setRepairing(false);
  };

  const handleSearch = useCallback(
    (query: string) => {
      if (!query.trim()) {
        setFiltered(policies);
        return;
      }
      const q = query.toLowerCase();
      setFiltered(
        policies.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q)
        )
      );
    },
    [policies]
  );

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">Policies</h1>
          <p className="text-gray-500 text-sm">
            School policy repository ({policies.length} policies)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {session?.permissions.includes("manage_policies") && (
            <button
              onClick={repairIndex}
              disabled={repairing}
              title="Finds policies whose file is in storage but which are missing from this list, and puts them back"
              className="border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {repairing ? "Checking..." : "Rebuild list from storage"}
            </button>
          )}
          {session?.permissions.includes("upload_policies") && (
            <Link
              href="/policies/upload"
              className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              + Upload Policy
            </Link>
          )}
        </div>
      </div>

      {notice && (
        <div className="mb-4 rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-700">
          {notice}
        </div>
      )}

      <div className="mb-4 max-w-md">
        <PolicySearch onSearch={handleSearch} />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Policy</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Category</th>
              <th className="text-center px-6 py-3 font-medium text-gray-500">Version</th>
              <th className="text-center px-6 py-3 font-medium text-gray-500">Compliance</th>
              <th className="text-right px-6 py-3 font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((policy) => (
              <tr
                key={policy.id}
                className="border-b border-gray-50 hover:bg-gray-50"
              >
                <td className="px-6 py-4">
                  <Link
                    href={`/policies/${policy.id}`}
                    className="font-medium text-dark hover:text-primary"
                  >
                    {policy.name}
                  </Link>
                  {policy.description && (
                    <p className="text-xs text-gray-400 mt-1 line-clamp-1">
                      {policy.description}
                    </p>
                  )}
                </td>
                <td className="px-6 py-4">
                  {session?.permissions.includes("manage_policies") ? (
                    <select
                      value={policy.category}
                      disabled={savingCategory === policy.id}
                      aria-label={`Category for ${policy.name}`}
                      onChange={(e) =>
                        changeCategory(policy.id, e.target.value)
                      }
                      className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs border border-transparent hover:border-gray-300 focus:border-primary outline-none cursor-pointer disabled:opacity-50"
                    >
                      {categoryOptions(policy.category, allCategories).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">
                      {policy.category}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-center text-gray-600">
                  v{policy.currentVersion}
                </td>
                <td className="px-6 py-4 flex justify-center">
                  {checkingIds.has(policy.id) ? (
                    <span className="text-xs text-gray-400">Checking...</span>
                  ) : policy.lastCheckScore !== null ? (
                    <span
                      title={
                        policy.lastCheckDate
                          ? `Last checked ${new Date(
                              policy.lastCheckDate
                            ).toLocaleString()}`
                          : undefined
                      }
                    >
                      <ComplianceScore score={policy.lastCheckScore} size="sm" />
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">Not checked</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right whitespace-nowrap">
                  {session?.permissions.includes("check_compliance") && (
                    <button
                      onClick={() => runCheck(policy)}
                      disabled={checkingIds.has(policy.id)}
                      title="Reads the current version and reports how well it meets the guidelines"
                      className="text-primary hover:text-primary-dark text-xs font-medium mr-4 disabled:opacity-50"
                    >
                      {checkingIds.has(policy.id) ? "Checking..." : "Run Check"}
                    </button>
                  )}
                  {session?.permissions.includes("download_policies") && (
                    <button
                      onClick={() => downloadPolicy(policy)}
                      disabled={downloading === policy.id}
                      className="text-primary hover:text-primary-dark text-xs font-medium mr-4 disabled:opacity-50"
                    >
                      {downloading === policy.id ? "Downloading..." : "Download"}
                    </button>
                  )}
                  <Link
                    href={`/policies/${policy.id}`}
                    className="text-primary hover:text-primary-dark text-xs font-medium"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-12 text-center text-gray-400"
                >
                  {policies.length === 0
                    ? "No policies uploaded yet."
                    : "No policies match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <ScoreNote />
      </div>
    </div>
  );
}
