import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { NO_CHANGE } from "@/lib/controlData";
import { cleanEntry } from "@/lib/section38a";
import { LOCKED, changeYear, guard } from "@/lib/section38aData";

type Ctx = { params: Promise<{ year: string; id: string }> };

/** A signature is kept but stops counting once the terms differ, so the screen can say why it must be signed again. */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { year, id } = await params;
  const auth = await guard(req, year);
  if (auth instanceof NextResponse) return auth;
  const terms = cleanEntry(((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>);
  if (typeof terms === "string") return NextResponse.json({ error: terms }, { status: 400 });

  let outcome = "missing" as "saved" | "locked" | "missing";
  await changeYear(auth.year, (y) => {
    if (y.lodged) return (outcome = "locked"), NO_CHANGE;
    if (!y.people.some((e) => e.id === id)) return (outcome = "missing"), NO_CHANGE;
    outcome = "saved";
    const confirmed = { by: `${auth.session.name} ${auth.session.surname}`.trim(), at: new Date().toISOString() };
    // A link sent to the wrong address must stop working once the address is corrected.
    return { ...y, people: y.people.map((e) => (e.id === id ? { ...e, ...terms, confirmed, problem: undefined, link: e.email === terms.email ? e.link : undefined } : e)) };
  });
  if (outcome === "locked") return NextResponse.json({ error: LOCKED }, { status: 409 });
  if (outcome === "missing") return NextResponse.json({ error: "That person is not on this list." }, { status: 404 });
  await recordActivity({ ...actorFrom(req, auth.session), action: "section38a.person_changed", entity: "section_38a", entityId: id, summary: `Changed ${terms.name} ${terms.surname} on the section 38A list for ${auth.year}` });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { year, id } = await params;
  const auth = await guard(req, year);
  if (auth instanceof NextResponse) return auth;
  let outcome = "missing" as "removed" | "locked" | "missing";
  let who = "";
  await changeYear(auth.year, (y) => {
    const e = y.people.find((p) => p.id === id);
    if (y.lodged) return (outcome = "locked"), NO_CHANGE;
    if (!e) return (outcome = "missing"), NO_CHANGE;
    outcome = "removed";
    who = `${e.name} ${e.surname}`;
    return { ...y, people: y.people.filter((p) => p.id !== id) };
  });
  if (outcome === "locked") return NextResponse.json({ error: LOCKED }, { status: 409 });
  if (outcome === "missing") return NextResponse.json({ error: "That person is not on this list." }, { status: 404 });
  await recordActivity({ ...actorFrom(req, auth.session), action: "section38a.person_removed", entity: "section_38a", entityId: id, summary: `Removed ${who} from the section 38A list for ${auth.year}` });
  return NextResponse.json({ success: true });
}
