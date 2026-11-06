import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { NO_CHANGE } from "@/lib/controlData";
import { cleanEntry } from "@/lib/section38a";
import { LOCKED, changeYear, guard } from "@/lib/section38aData";

export async function POST(req: NextRequest, { params }: { params: Promise<{ year: string }> }) {
  const auth = await guard(req, (await params).year);
  if (auth instanceof NextResponse) return auth;
  const terms = cleanEntry(((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>);
  if (typeof terms === "string") return NextResponse.json({ error: terms }, { status: 400 });

  const id = randomUUID();
  let locked = false;
  await changeYear(auth.year, (y) => {
    locked = !!y.lodged;
    return locked ? NO_CHANGE : { ...y, people: [...y.people, { ...terms, id }] };
  });
  if (locked) return NextResponse.json({ error: LOCKED }, { status: 409 });
  await recordActivity({ ...actorFrom(req, auth.session), action: "section38a.person_added", entity: "section_38a", entityId: id, summary: `Added ${terms.name} ${terms.surname} to the section 38A list for ${auth.year}` });
  return NextResponse.json({ id }, { status: 201 });
}
