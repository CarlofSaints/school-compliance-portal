import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { NO_CHANGE, deleteFile } from "@/lib/controlData";
import { todaySast } from "@/lib/governanceTerm";
import { isDate, overview, type FileRef } from "@/lib/section38a";
import { changeYear, filePath, getYear, guard, sameEmail } from "@/lib/section38aData";
import { getTagMembers } from "@/lib/tagData";

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

  // A tag can move after a chair signed; the undertaking must carry the sitting chair.
  const current = await getYear(auth.year);
  for (const [chair, tagId] of [[current.chairs.sgb, current.sgbTagId], [current.chairs.finance, current.financeTagId]] as const) {
    if (chair && tagId && !(await getTagMembers(tagId)).some((m) => sameEmail(m.email, chair.email))) {
      return NextResponse.json({ error: `${chair.name} no longer carries the chair's tag. Send it to the new chair to sign.` }, { status: 409 });
    }
  }

  let gaps: string[] = [];
  let already = false;
  await changeYear(auth.year, (y) => {
    gaps = overview(y, today).gaps;
    already = !!y.lodged;
    if (gaps.length || already) return NO_CHANGE;
    return { ...y, lodged: { date, how: text(b.how), reference: text(b.reference), by: `${auth.session.name} ${auth.session.surname}`.trim() } };
  });
  if (already) return NextResponse.json({ error: "This application has already been lodged." }, { status: 409 });
  if (gaps.length) return NextResponse.json({ error: `Not ready to lodge. Still needed: ${gaps.join(", ")}.` }, { status: 409 });
  await recordActivity({ ...actorFrom(req, auth.session), action: "section38a.lodged", entity: "section_38a", entityId: String(auth.year), summary: `Recorded the section 38A application for ${auth.year} as lodged on ${date}` });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await guard(req, (await params).year);
  if (auth instanceof NextResponse) return auth;
  let decided = false;
  let letter = undefined as FileRef | undefined;
  await changeYear(auth.year, (y) => {
    decided = y.people.some((e) => e.decision);
    if (decided || !y.lodged) return NO_CHANGE;
    letter = y.letter;
    // The letter goes too: it answered this lodgement, not the next one.
    const { lodged: _lodged, letter: _letter, ...rest } = y;
    return rest;
  });
  if (decided) return NextResponse.json({ error: "Decisions have been recorded. Clear them first." }, { status: 409 });
  if (letter) await deleteFile(filePath(auth.year, "letter", letter));
  await recordActivity({ ...actorFrom(req, auth.session), action: "section38a.lodge_undone", entity: "section_38a", entityId: String(auth.year), summary: `Undid the section 38A lodgement for ${auth.year}` });
  return NextResponse.json({ success: true });
}
