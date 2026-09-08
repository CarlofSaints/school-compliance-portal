import Link from "next/link";
import { NextResponse } from "next/server";
import PlatformSignedOut from "@/components/PlatformSignedOut";
import { requirePlatformAdmin } from "@/lib/platformAdmin";
import { listCodes } from "@/lib/platformCodes";
import { listTenants } from "@/lib/tenantRegistry";
import CodeBuilder from "./CodeBuilder";

// Carl: "i really want a UI on the backend portal where i can create my own
// discount codes and i can decide how they work".
//
// A server component so the gate runs before anything renders. Same reasoning
// as /platform: a page cannot return the gate's 404, so it shows the bare
// "not available" instead of redirecting to a school sign-in that has nothing
// to do with the platform.

export const dynamic = "force-dynamic";

export default async function CodesPage() {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return <PlatformSignedOut />;

  // Schools are needed so an "existing school" code can be pointed at one from
  // a list rather than by typing a key from memory and silently missing.
  const [codes, tenants] = await Promise.all([
    listCodes().catch(() => []),
    listTenants().catch(() => []),
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-dark text-white px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Discount codes</h1>
            <p className="text-xs text-white/60">Platform administration</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-white/60">
            <Link href="/platform" className="underline hover:text-white">
              All schools
            </Link>
            <span>{admin.email}</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        <CodeBuilder
          initialCodes={codes}
          schools={tenants.map((t) => ({ key: t.key, name: t.name }))}
        />
      </main>
    </div>
  );
}
