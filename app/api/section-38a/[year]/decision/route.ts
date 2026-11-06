import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { NO_CHANGE } from "@/lib/controlData";
import { changeYear, guard } from "@/lib/section38aData";

// One letter can approve some people and refuse others, so each is recorded on
// its own. Nobody shows as approved until the letter is in the system.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ year: string }> }) {
  const auth = await guard(req, (await params).year);
  if (auth instanceof NextResponse) return auth;
  const b = (await req.json().catch(() => null)) as { id?: unknown; decision?: unknown } | null;
  const decision = b?.decision === "approved" || b?.decision === "refused" ? b.decision : undefined;
  if (b?.decision !== null && !decision) return NextResponse.json({ error: "Choose approved or refused." }, { status: 400 });

  let outcome = "missing" as "saved" | "no_letter" | "missing";
  let who = "";
  await changeYear(auth.year, (y) => {
    const e = y.people.find((p) => p.id === b?.id);
    if (!e) return NO_CHANGE;
    if (!y.lodged || !y.letter) return (outcome = "no_letter"), NO_CHANGE;
    outcome = "saved";
    who = `${e.name} ${e.surname}`;
    return { ...y, people: y.people.map((p) => (p.id === e.id ? { ...p, decision } : p)) };
  });
  if (outcome === "no_letter") return NextResponse.json({ error: "Upload the Head of Department's letter first." }, { status: 409 });
  if (outcome === "missing") return NextResponse.json({ error: "That person is not on this list." }, { status: 404 });
  await recordActivity({ ...actorFrom(req, auth.session), action: "section38a.decision", entity: "section_38a", entityId: String(b?.id), summary: `Recorded ${who} as ${decision ?? "not decided"} for section 38A ${auth.year}` });
  return NextResponse.json({ success: true });
}
