import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { NO_CHANGE } from "@/lib/controlData";
import { todaySast } from "@/lib/governanceTerm";
import { getPeople } from "@/lib/peopleData";
import { getPolicies } from "@/lib/policyData";
import { SOURCES, isDate, manyOf, overview, yearForClient, type Year } from "@/lib/section38a";
import { LOCKED, changeYear, getYear, guard } from "@/lib/section38aData";
import { getTags } from "@/lib/tagData";

type Ctx = { params: Promise<{ year: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await guard(req, (await params).year);
  if (auth instanceof NextResponse) return auth;
  const [y, tags, policies, people] = await Promise.all([getYear(auth.year), getTags(), getPolicies(), getPeople()]);
  return NextResponse.json(
    {
      year: yearForClient(y),
      overview: overview(y, todaySast()),
      tags: tags.map((t) => ({ id: t.id, name: t.name })),
      policies: policies.map((p) => ({ id: p.id, name: p.name })),
      people: people.filter((p) => p.name).map((p) => ({ id: p.id, name: p.name, email: p.email })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** Year setup and the SGB's approval. A signature on them stops counting when they change (applicationTerms). */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await guard(req, (await params).year);
  if (auth instanceof NextResponse) return auth;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const date = (v: unknown) => (isDate(v) ? v : "");

  const [tags, policies] = await Promise.all([getTags(), getPolicies()]);
  const known = (id: string, list: { id: string }[]) => (list.some((x) => x.id === id) ? id : "");
  const a = (b.approval ?? {}) as Record<string, unknown>;
  const fields: Partial<Year> = {
    budgetDate: date(b.budgetDate),
    province: text(b.province, 40),
    district: text(b.district, 80),
    emis: text(b.emis, 20),
    budgetLine: Math.max(0, Math.round(Number(b.budgetLine) * 100) / 100 || 0),
    sources: manyOf(b.sources, SOURCES),
    policyId: known(text(b.policyId, 60), policies),
    sgbTagId: known(text(b.sgbTagId, 60), tags),
    financeTagId: known(text(b.financeTagId, 60), tags),
    approval: {
      meetingDate: date(a.meetingDate),
      item: text(a.item, 200),
      steppedOut: text(a.steppedOut, 300),
      sections20: a.sections20 === true,
      funds: a.funds === true,
      affordable: a.affordable === true,
    },
  };
  if (!fields.budgetDate) return NextResponse.json({ error: "Give the date the budget is finalised." }, { status: 400 });

  let locked = false;
  await changeYear(auth.year, (y) => {
    locked = !!y.lodged;
    return locked ? NO_CHANGE : { ...y, ...fields };
  });
  if (locked) return NextResponse.json({ error: LOCKED }, { status: 409 });
  await recordActivity({ ...actorFrom(req, auth.session), action: "section38a.setup_saved", entity: "section_38a", entityId: String(auth.year), summary: `Saved the section 38A setup for ${auth.year}` });
  return NextResponse.json({ success: true });
}
