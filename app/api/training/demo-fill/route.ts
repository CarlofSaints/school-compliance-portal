import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { tenantScope } from "@/lib/tenantContext";
import { getPeople } from "@/lib/peopleData";
import { seedDemoCampus } from "@/lib/demoCampus";

export const maxDuration = 120;

// The DEMO school only: makes its invented governing body into logins and
// gives them invented Campus scores, so the leaderboard has something to show.
// 🔴 Refused anywhere but the school whose key is "demo", and even there only
// the register's `.example` entries (the invented body) are used: a real
// person added to the demo is never given a login or scores.
const isDemo = async () => (await tenantScope()).key === "demo";

export async function GET(req: NextRequest) {
  const session = await requirePermission(req, "manage_training");
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ available: await isDemo() });
}

export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_training");
  if (session instanceof NextResponse) return session;
  if (!(await isDemo())) return NextResponse.json({ error: "Only on the demo school." }, { status: 403 });
  const people = (await getPeople()).filter((p) => p.email.trim().toLowerCase().endsWith(".example"));
  if (people.length === 0) {
    return NextResponse.json({ error: "The People register has no demo governors." }, { status: 409 });
  }
  return NextResponse.json(await seedDemoCampus(people));
}
