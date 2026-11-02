import Link from "next/link";
import { NextResponse } from "next/server";
import PlatformSignedOut from "@/components/PlatformSignedOut";
import { requirePlatformAdmin } from "@/lib/platformAdmin";
import { SCHOOLS } from "@/lib/branding";
import MoveSchool from "./MoveSchool";

// Carl: "let's move jeppe. if it all goes well, then we can look to move HVPS".
export const dynamic = "force-dynamic";

export default async function MoveSchoolPage() {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return <PlatformSignedOut />;
  // The schools that still have their own deployment, by key.
  const schools = Object.fromEntries(["jeppe", "hvps"].filter((k) => SCHOOLS[k]).map((k) => [k, SCHOOLS[k].fullName]));
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-dark text-white px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Move a school onto the shared app</h1>
            <p className="text-xs text-white/60">Platform administration</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-white/60">
            <Link href="/platform" className="underline hover:text-white">All schools</Link>
            <span>{admin.email}</span>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-6">
        <MoveSchool schools={schools} />
      </main>
    </div>
  );
}
