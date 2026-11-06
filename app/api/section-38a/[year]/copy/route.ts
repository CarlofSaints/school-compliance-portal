import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { NO_CHANGE } from "@/lib/controlData";
import { changeYear, getYear, guard } from "@/lib/section38aData";

// Last year's list and setup, as a starting point. Terms only: signatures,
// links and decisions belong to the year they were given in.
export async function POST(req: NextRequest, { params }: { params: Promise<{ year: string }> }) {
  const auth = await guard(req, (await params).year);
  if (auth instanceof NextResponse) return auth;
  const last = await getYear(auth.year - 1);
  if (!last.people.length) return NextResponse.json({ error: "There is no list for last year to copy." }, { status: 404 });

  let copied = false;
  await changeYear(auth.year, (y) => {
    copied = !y.people.length && !y.lodged;
    if (!copied) return NO_CHANGE;
    return {
      ...y,
      province: y.province || last.province,
      district: y.district || last.district,
      emis: y.emis || last.emis,
      sources: y.sources.length ? y.sources : last.sources,
      policyId: y.policyId || last.policyId,
      sgbTagId: y.sgbTagId || last.sgbTagId,
      financeTagId: y.financeTagId || last.financeTagId,
      people: last.people.map(({ link: _l, signature: _s, problem: _p, decision: _d, confirmed: _c, ...terms }) => ({ ...terms, id: randomUUID() })),
    };
  });
  if (!copied) return NextResponse.json({ error: "This year already has people on it." }, { status: 409 });
  await recordActivity({ ...actorFrom(req, auth.session), action: "section38a.copied", entity: "section_38a", entityId: String(auth.year), summary: `Copied the ${auth.year - 1} section 38A list to ${auth.year}` });
  return NextResponse.json({ success: true });
}
