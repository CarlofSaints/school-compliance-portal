"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback } from "react";
import PolicySearch from "@/components/PolicySearch";
import ComplianceScore from "@/components/ComplianceScore";
import Link from "next/link";

interface PolicyRecord {
  id: string;
  name: string;
  description: string;
  category: string;
  currentVersion: number;
  lastCheckScore: number | null;
  updatedAt: string;
}

export default function PoliciesPage() {
  const { session, loading } = useAuth("download_policies");
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [filtered, setFiltered] = useState<PolicyRecord[]>([]);
  const [repairing, setRepairing] = useState(false);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);

  const fetchPolicies = useCallback(async () => {
    const res = await authFetch("/api/policies");
    if (res.ok) {
      const data = await res.json();
      setPolicies(data);
      setFiltered(data);
    }
  }, []);

  useEffect(() => {
    if (session) fetchPolicies();
  }, [session, fetchPolicies]);

  // Puts back any policy whose file is in storage but whose index entry was
  // lost. Only ever adds, so it is safe to press at any time.
  const repairIndex = async () => {
    setRepairing(true);
    setRepairMessage(null);
    const res = await authFetch("/api/policies/repair-index", {
      method: "POST",
    });
    if (res.ok) {
      const result = await res.json();
      setRepairMessage(
        result.recovered === 0
          ? "Nothing missing — every policy in storage is already listed."
          : `Recovered ${result.recovered} ${
              result.recovered === 1 ? "policy" : "policies"
            }: ${result.policies
              .map((p: { name: string }) => p.name)
              .join(", ")}. Check their names and categories.`
      );
      fetchPolicies();
    } else {
      setRepairMessage("Could not rebuild the list. Try again.");
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

      {repairMessage && (
        <div className="mb-4 rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-700">
          {repairMessage}
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
                  <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">
                    {policy.category}
                  </span>
                </td>
                <td className="px-6 py-4 text-center text-gray-600">
                  v{policy.currentVersion}
                </td>
                <td className="px-6 py-4 flex justify-center">
                  {policy.lastCheckScore !== null ? (
                    <ComplianceScore score={policy.lastCheckScore} size="sm" />
                  ) : (
                    <span className="text-xs text-gray-400">Not checked</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
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
    </div>
  );
}
