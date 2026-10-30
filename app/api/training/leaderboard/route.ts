import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { buildLeaderboard } from "@/lib/training";
import { allProgress, getModules, getTests } from "@/lib/trainingData";

export const dynamic = "force-dynamic";

// Every user and their scores, for everybody in the portal (Carl: "show all
// users and their scores").
export async function GET(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  const [{ users, progress }, tests, modules] = await Promise.all([allProgress(), getTests(), getModules()]);
  const rows = buildLeaderboard(users, progress, tests, modules);
  return NextResponse.json(
    {
      rows,
      me: session.id,
      publishedTests: tests.filter((t) => t.status === "published").length,
      publishedModules: modules.filter((m) => m.status === "published").length,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
