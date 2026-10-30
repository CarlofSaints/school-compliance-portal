import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { tenantScope } from "@/lib/tenantContext";
import { getPeople } from "@/lib/peopleData";
import { seedDemoCampus } from "@/lib/demoCampus";

export const maxDuration = 120;

// The DEMO school only: makes its invented governing body into logins and
// gives them invented Campus scores, so the leaderboard has something to show.
// 🔴 Refused anywhere but the school whose key is "demo", and refused there too
// if any register entry has a real-looking address: it must never put
// invented scores on a real school's board.
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
  const people = await getPeople();
  if (people.length === 0 || people.some((p) => !p.email.endsWith(".example"))) {
    return NextResponse.json({ error: "The People register is not the demo governing body." }, { status: 409 });
  }
  return NextResponse.json(await seedDemoCampus(people));
}
