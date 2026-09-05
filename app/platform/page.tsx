import Link from "next/link";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platformAdmin";
import { platformOverview, type SchoolSummary } from "@/lib/platformStats";

// Carl's own view across every school. A server component, so the gate runs
// before a single byte of this renders: nothing about the platform reaches a
// browser that should not have it, not even the shell.
//
// Deliberately OUTSIDE the (portal) route group. That layout is a school's
// sidebar, and this page is not inside any school.

export const dynamic = "force-dynamic";

function fmt(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("en-ZA");
}

export default async function PlatformPage() {
  const admin = await requirePlatformAdmin();
  // The gate hands back a 404 response for an API route; a page cannot return
  // one, so anyone not allowed is simply sent away. Same outcome, no signal.
  if (admin instanceof NextResponse) redirect("/login");

  const { schools, totals } = await platformOverview();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-dark text-white px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">School Compliance</h1>
            <p className="text-xs text-white/60">Platform administration</p>
          </div>
          <span className="text-xs text-white/60">{admin.email}</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <Stat label="Schools" value={totals.schools} />
          <Stat label="Active" value={totals.active} />
          <Stat label="Suspended" value={totals.suspended} tone={totals.suspended > 0 ? "warn" : undefined} />
          <Stat label="Users across all schools" value={totals.users} />
        </div>

        {totals.unreadable > 0 && (
          // Said out loud rather than swallowed. A total quietly missing two
          // schools is worse than no total, because it looks authoritative.
          <div className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {totals.unreadable} school{totals.unreadable === 1 ? "" : "s"} could not
            be read, so the figures above do not include{" "}
            {totals.unreadable === 1 ? "it" : "them"}. See the rows marked below.
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">School</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Address</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Users</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">People</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Policies</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Funding</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Since</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Log</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {schools.map((s) => (
                <SchoolRow key={s.key} school={s} />
              ))}
              {schools.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-400">
                    No schools yet. The first one to sign up appears here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-gray-400">
          Opening a school&apos;s log is recorded in that school&apos;s own audit
          trail, so they can see when their records were accessed.
        </p>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn";
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p
        className={`text-2xl font-bold mt-1 ${
          tone === "warn" ? "text-amber-600" : "text-dark"
        }`}
      >
        {value.toLocaleString("en-ZA")}
      </p>
    </div>
  );
}

function SchoolRow({ school: s }: { school: SchoolSummary }) {
  return (
    <tr className={s.error ? "bg-amber-50/50" : "hover:bg-gray-50"}>
      <td className="px-4 py-3">
        <div className="font-medium text-dark">{s.name}</div>
        <div className="text-xs text-gray-400">{s.key}</div>
        {s.error && (
          <div className="text-xs text-amber-700 mt-1">Could not read: {s.error}</div>
        )}
      </td>
      <td className="px-4 py-3">
        {s.hostnames.map((h) => (
          <div key={h} className="text-xs text-gray-500">
            {h}
          </div>
        ))}
        {s.status !== "active" && (
          <span className="text-xs text-amber-700">{s.status}</span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {fmt(s.users)}
        {/* 20 is what the free Clerk tier allows per organisation, and the
            number the pricing page promises. A school at or over it is about
            to cost more to run than it pays. */}
        {s.users !== null && s.users >= 20 && (
          <span className="ml-1 text-xs text-amber-600" title="At or over the 20 user limit">
            !
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{fmt(s.people)}</td>
      <td className="px-4 py-3 text-right tabular-nums">{fmt(s.policies)}</td>
      <td className="px-4 py-3 text-right tabular-nums">{fmt(s.spendApplications)}</td>
      <td className="px-4 py-3 text-right tabular-nums">{fmt(s.actionItems)}</td>
      <td className="px-4 py-3 text-gray-500 text-xs">
        {new Date(s.createdAt).toLocaleDateString("en-ZA", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          href={`/platform/${s.key}`}
          className="text-primary hover:text-primary-dark text-xs font-medium"
        >
          View
        </Link>
      </td>
    </tr>
  );
}
