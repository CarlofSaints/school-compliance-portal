import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platformAdmin";
import { getTenantByKey } from "@/lib/tenantRegistry";
import { runAsTenant } from "@/lib/tenantContext";
import { readActivity, recordActivity } from "@/lib/activityLog";

// One school's audit trail, seen by Carl.
//
// Server-rendered so the gate runs before anything reaches the browser, and so
// the read is logged in that school's own trail exactly once per view rather
// than on every client refetch.

export const dynamic = "force-dynamic";

export default async function PlatformSchoolPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) redirect("/login");

  const { key } = await params;
  const { month } = await searchParams;

  const tenant = await getTenantByKey(key);
  if (!tenant) notFound();

  const page = await runAsTenant(key, async () => {
    const result = await readActivity({ month, limit: 200 });

    // 🔴 Recorded in THIS SCHOOL'S log, not ours. An operator who can read
    // everything and leaves no trace is the gap an audit trail exists to close.
    await recordActivity({
      actorName: `${admin.email} (School Compliance support)`,
      actorEmail: admin.email,
      action: "activity.viewed.by_platform",
      entity: "system",
      summary: `Support viewed this school's activity log for ${result.month}`,
      detail: { month: result.month },
    });

    return result;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-dark text-white px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <Link href="/platform" className="text-xs text-white/60 hover:text-white">
              Back to all schools
            </Link>
            <h1 className="text-lg font-bold mt-0.5">{tenant.name}</h1>
            <p className="text-xs text-white/60">
              {tenant.key} · {tenant.hostnames.join(", ")} · {tenant.status}
            </p>
          </div>
          <a
            href={`/api/platform/schools/${key}/activity?format=csv&month=${page.month}`}
            className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Export {page.month}
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {page.availableMonths.length > 1 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {page.availableMonths.map((m) => (
              <Link
                key={m}
                href={`/platform/${key}?month=${m}`}
                className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                  m === page.month
                    ? "bg-primary text-white border-primary"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {m}
              </Link>
            ))}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500 w-40">When</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 w-48">Who</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">What happened</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 w-32">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {page.entries.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50 align-top">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(e.at).toLocaleString("en-ZA", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-dark">{e.actorName}</div>
                    {e.actorEmail && (
                      <div className="text-xs text-gray-400">{e.actorEmail}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {e.summary}
                    {e.detail && Object.keys(e.detail).length > 0 && (
                      <div className="mt-1 text-xs text-gray-400 font-mono break-all">
                        {JSON.stringify(e.detail)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">
                      {e.entity}
                    </span>
                  </td>
                </tr>
              ))}
              {page.entries.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                    Nothing recorded for {page.month}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-gray-400">
          Showing {page.entries.length} of {page.total} entries for {page.month}.
          This view has been recorded in the school&apos;s own log.
        </p>
      </main>
    </div>
  );
}
