import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { NO_CHANGE } from "@/lib/controlData";
import { todaySast } from "@/lib/governanceTerm";
import { isDate, overview } from "@/lib/section38a";
import { changeYear, guard } from "@/lib/section38aData";

type Ctx = { params: Promise<{ year: string }> };

// The school lodges with the department itself; this records that it did. The
// date starts the three-month clock for an appeal. Once lodged, the list locks.
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await guard(req, (await params).year);
  if (auth instanceof NextResponse) return auth;
  const b = (await req.json().catch(() => null)) as { date?: unknown; how?: unknown; reference?: unknown } | null;
  const today = todaySast();
  if (!isDate(b?.date) || b.date > today) return NextResponse.json({ error: "Give the date it was lodged." }, { status: 400 });
  const date = b.date;
  const text = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");

  let gaps: string[] = [];
  await changeYear(auth.year, (y) => {
    gaps = overview(y, today).gaps;
    if (gaps.length || y.lodged) return NO_CHANGE;
    return { ...y, lodged: { date, how: text(b.how), reference: text(b.reference), by: `${auth.session.name} ${auth.session.surname}`.trim() } };
  });
  if (gaps.length) return NextResponse.json({ error: `Not ready to lodge. Still needed: ${gaps.join(", ")}.` }, { status: 409 });
  await recordActivity({ ...actorFrom(req, auth.session), action: "section38a.lodged", entity: "section_38a", entityId: String(auth.year), summary: `Recorded the section 38A application for ${auth.year} as lodged on ${date}` });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await guard(req, (await params).year);
  if (auth instanceof NextResponse) return auth;
  let decided = false;
  await changeYear(auth.year, (y) => {
    decided = y.people.some((e) => e.decision);
    if (decided || !y.lodged) return NO_CHANGE;
    const { lodged: _lodged, ...rest } = y;
    return rest;
  });
  if (decided) return NextResponse.json({ error: "Decisions have been recorded. Clear them first." }, { status: 409 });
  await recordActivity({ ...actorFrom(req, auth.session), action: "section38a.lodge_undone", entity: "section_38a", entityId: String(auth.year), summary: `Undid the section 38A lodgement for ${auth.year}` });
  return NextResponse.json({ success: true });
}
