"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useEffect, useState } from "react";
import Image from "next/image";
import DashboardCard from "@/components/DashboardCard";
import { branding } from "@/lib/branding";
import { pendingSpendCount } from "@/lib/spendReport";

interface StatusCounts {
  not_an_issue: number;
  needs_addressing: number;
  in_progress: number;
  addressed: number;
  unreviewed: number;
}

interface CheckSummary {
  id: string;
  name: string;
  score: number;
  issueCount: number;
  statusCounts?: StatusCounts;
  checkedByName: string;
  checkedAt: string;
}

const DASH_STATUS_META: { key: keyof StatusCounts; label: string; text: string }[] = [
  { key: "needs_addressing", label: "Needs to be addressed", text: "text-risk-high" },
  { key: "in_progress", label: "In progress", text: "text-amber-600" },
  { key: "addressed", label: "Addressed in new policy", text: "text-emerald-600" },
  { key: "not_an_issue", label: `Not an issue for ${branding.shortName}`, text: "text-gray-600" },
];

// Compact per-row pills for the grid's Status column.
const STATUS_PILLS: { key: keyof StatusCounts; short: string; pill: string }[] = [
  { key: "needs_addressing", short: "to address", pill: "bg-red-100 text-red-700" },
  { key: "in_progress", short: "in progress", pill: "bg-amber-100 text-amber-700" },
  { key: "addressed", short: "addressed", pill: "bg-emerald-100 text-emerald-700" },
  { key: "not_an_issue", short: "not an issue", pill: "bg-gray-100 text-gray-600" },
];

export default function DashboardPage() {
  const { session, loading } = useAuth("view_dashboard");
  const [checks, setChecks] = useState<CheckSummary[]>([]);
  const [pendingSpend, setPendingSpend] = useState(0);
  const [financialYear, setFinancialYear] = useState<number | null>(null);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const res = await authFetch("/api/compliance/checks", { cache: "no-store" });
      if (res.ok) setChecks(await res.json());

      // Spend awaiting approval, scoped to the current financial year.
      const [spendRes, settingsRes] = await Promise.all([
        authFetch("/api/spend", { cache: "no-store" }),
        authFetch("/api/settings/spend", { cache: "no-store" }),
      ]);
      if (spendRes.ok && settingsRes.ok) {
        const apps = await spendRes.json();
        const settings = await settingsRes.json();
        const year = settings.capexYear || new Date().getFullYear();
        setFinancialYear(year);
        setPendingSpend(
          pendingSpendCount(apps, year, settings.financialYearEndMonth ?? 12)
        );
      }
    })();
  }, [session]);

  const totalChecks = checks.length;
  const nonCompliant = checks.filter((c) => c.issueCount > 0).length;
  const statusTotals = checks.reduce(
    (acc, c) => {
      if (c.statusCounts) {
        acc.not_an_issue += c.statusCounts.not_an_issue;
        acc.needs_addressing += c.statusCounts.needs_addressing;
        acc.in_progress += c.statusCounts.in_progress;
        acc.addressed += c.statusCounts.addressed;
        acc.unreviewed += c.statusCounts.unreviewed;
      }
      return acc;
    },
    { not_an_issue: 0, needs_addressing: 0, in_progress: 0, addressed: 0, unreviewed: 0 } as StatusCounts
  );

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
        <h1 className="text-2xl font-bold text-dark">
          Welcome, {session?.name}
        </h1>
        <p className="text-gray-500 text-sm">
          {branding.fullName} {branding.tagline}
        </p>
        </div>
        <Image src={branding.logo} alt={branding.fullName} width={60} height={72} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <DashboardCard
          title="Total Policies"
          value={0}
          subtitle="Uploaded to repository"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
        <DashboardCard
          title="Compliance Checks"
          value={totalChecks}
          subtitle="Total checks run"
          color="bg-emerald-500"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          }
        />
        <DashboardCard
          title="Non-Compliant"
          value={nonCompliant}
          subtitle="Checks with issues"
          color="bg-risk-high"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          }
        />
        <DashboardCard
          title="Spend Pending"
          value={pendingSpend}
          subtitle={
            financialYear
              ? `Awaiting approval · FY ${financialYear}`
              : "Awaiting approval"
          }
          color="bg-risk-low"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
            </svg>
          }
        />
      </div>

      {checks.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
          <h2 className="text-lg font-semibold text-dark mb-4">Issues by Status</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {DASH_STATUS_META.map((s) => (
              <div key={s.key} className="border border-gray-100 rounded-lg p-4">
                <p className={`text-3xl font-bold ${s.text}`}>{statusTotals[s.key]}</p>
                <p className="text-xs text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
          {statusTotals.unreviewed > 0 && (
            <p className="text-xs text-gray-400 mt-3">
              {statusTotals.unreviewed} issue{statusTotals.unreviewed === 1 ? "" : "s"} not yet reviewed.
            </p>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
        <h2 className="text-lg font-semibold text-dark mb-4">Compliance Checks</h2>
        {checks.length === 0 ? (
          <p className="text-sm text-gray-500">
            No documents have been checked yet. Run a check from the{" "}
            <a href="/compliance" className="text-primary hover:underline">
              Compliance Check
            </a>{" "}
            page.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100">
                  <th className="pb-2 font-medium w-10">#</th>
                  <th className="pb-2 font-medium">Document</th>
                  <th className="pb-2 font-medium">Score</th>
                  <th className="pb-2 font-medium">Issues to fix</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Checked by</th>
                  <th className="pb-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c, i) => (
                  <tr key={c.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-3 text-gray-400">{i + 1}</td>
                    <td className="py-3">
                      <a
                        href={`/compliance?check=${c.id}`}
                        className="text-primary font-medium hover:underline"
                      >
                        {c.name}
                      </a>
                    </td>
                    <td className="py-3">
                      <span
                        className={`font-semibold ${
                          c.score >= 80
                            ? "text-emerald-600"
                            : c.score >= 50
                            ? "text-amber-600"
                            : "text-risk-high"
                        }`}
                      >
                        {c.score}%
                      </span>
                    </td>
                    <td className="py-3">
                      {c.issueCount === 0 ? (
                        <span className="text-emerald-600">None</span>
                      ) : (
                        <span className="text-gray-700">
                          {c.issueCount} {c.issueCount === 1 ? "issue" : "issues"}
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      {c.issueCount === 0 || !c.statusCounts ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {STATUS_PILLS.map((s) =>
                            c.statusCounts && c.statusCounts[s.key] > 0 ? (
                              <span
                                key={s.key}
                                className={`text-[11px] px-1.5 py-0.5 rounded ${s.pill}`}
                              >
                                {c.statusCounts[s.key]} {s.short}
                              </span>
                            ) : null
                          )}
                          {c.statusCounts.unreviewed > 0 && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">
                              {c.statusCounts.unreviewed} untagged
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-gray-500">{c.checkedByName}</td>
                    <td className="py-3 text-gray-500">
                      {new Date(c.checkedAt).toLocaleDateString("en-GB")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-dark mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {session?.permissions.includes("upload_policies") && (
            <a
              href="/policies/upload"
              className="p-4 border border-gray-200 rounded-lg hover:border-primary hover:bg-primary/5 transition-colors group"
            >
              <h3 className="font-medium text-dark group-hover:text-primary">
                Upload Policy
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Add a new policy to the repository
              </p>
            </a>
          )}
          {session?.permissions.includes("check_compliance") && (
            <a
              href="/compliance"
              className="p-4 border border-gray-200 rounded-lg hover:border-primary hover:bg-primary/5 transition-colors group"
            >
              <h3 className="font-medium text-dark group-hover:text-primary">
                Run Compliance Check
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Check a policy against guidelines
              </p>
            </a>
          )}
          {session?.permissions.includes("submit_spend") && (
            <a
              href="/spend/new"
              className="p-4 border border-gray-200 rounded-lg hover:border-primary hover:bg-primary/5 transition-colors group"
            >
              <h3 className="font-medium text-dark group-hover:text-primary">
                New Spend Application
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Submit a spend request for approval
              </p>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
