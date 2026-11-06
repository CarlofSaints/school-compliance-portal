import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activityLog";
import { resolveBranding } from "@/lib/brandingData";
import { NO_CHANGE } from "@/lib/controlData";
import { sendSection38aProblemEmail } from "@/lib/email";
import { SignatureError, decodeSignature } from "@/lib/minutesSigning";
import { getPolicyById } from "@/lib/policyData";
import { LIMITS, enforce, ipOf } from "@/lib/rateLimit";
import { ACTIVITIES, BENEFITS, PAYS, SOURCES, TIMES, WILLINGNESS, applicationTerms, chairSigned, employeeSigned, employeeUndertaking, entryTerms, sgbUndertaking, yearMax, type Year } from "@/lib/section38a";
import { changeYear, getYear, openLink, parseToken, saveSignature, type LinkTarget } from "@/lib/section38aData";

// A signer's link: no sign-in, the secret in the emailed link is the key. It
// shows only what that person signs, and they give back the terms they saw, so
// a change made while the page was open cannot be signed unread.

type Ctx = { params: Promise<{ token: string }> };
const GONE = "This link has expired or been replaced. Ask the school to send a new one.";
const gone = () => NextResponse.json({ error: GONE }, { status: 404 });
const termsOf = (y: Year, t: LinkTarget) => (t.kind === "chair" ? applicationTerms(y) : entryTerms(y, t.entry));
const nameOf = (t: LinkTarget) => (t.kind === "chair" ? t.chair.name : `${t.entry.name} ${t.entry.surname}`);

export async function GET(req: NextRequest, { params }: Ctx) {
  const parsed = parseToken((await params).token);
  const limited = await enforce(parsed ? [[LIMITS.section38aIp, ipOf(req)], [LIMITS.section38aLink, parsed.target]] : [[LIMITS.section38aIp, ipOf(req)]]);
  if (limited) return limited;
  if (!parsed) return gone();
  const y = await getYear(parsed.year);
  const t = openLink(y, parsed.target, parsed.secret);
  if (!t) return gone();
  const { fullName: school } = await resolveBranding();

  const headers = { "Cache-Control": "no-store" };
  const base = { school, year: y.year, name: nameOf(t), terms: termsOf(y, t) };
  if (t.kind === "chair") {
    const who = y.people.map((e) => `${e.name} ${e.surname}`).join(", ");
    const policyName = (y.policyId && (await getPolicyById(y.policyId))?.name) || "-";
    return NextResponse.json(
      {
        ...base,
        kind: "chair",
        line: t.line,
        signed: chairSigned(y, t.chair),
        undertaking: sgbUndertaking(school, who),
        // Everything applicationTerms covers: a chair must see what the signature will stand for.
        facts: [
          { label: "Province", value: y.province },
          { label: "District", value: y.district },
          { label: "EMIS number", value: y.emis },
          { label: "Date the budget is finalised", value: y.budgetDate },
          { label: "Budget line for 38A, tax included", value: `R ${y.budgetLine.toFixed(2)}` },
          { label: "Section 38A policy", value: policyName },
          { label: "SGB meeting date", value: y.approval.meetingDate },
          { label: "Minutes item", value: y.approval.item },
          { label: "Who stepped out for this item (staff on the SGB who are on this list)", value: y.approval.steppedOut || "-" },
        ],
        sources: y.sources.map((s) => SOURCES[s]),
        confirmations: [
          ...(y.approval.sections20 ? ["SGB-employed staff comply with sections 20(5) to (9)."] : []),
          ...(y.approval.funds ? ["None of this comes from the state allocation, and the budget includes tax."] : []),
          ...(y.approval.affordable ? ["The school's assets will exceed its liabilities after these payments."] : []),
        ],
        people: y.people.map((e) => ({
          name: `${e.name} ${e.surname}`,
          persal: e.persal,
          rank: e.rank,
          benefit: BENEFITS[e.benefit],
          description: e.description,
          details: e.details,
          pay: PAYS[e.pay],
          amount: e.amount,
          max: yearMax(e),
        })),
      },
      { headers }
    );
  }
  const e = t.entry;
  return NextResponse.json(
    {
      ...base,
      kind: "employee",
      signed: employeeSigned(y, e),
      undertaking: employeeUndertaking(y, e, school),
      willingness: WILLINGNESS,
      entry: {
        persal: e.persal,
        rank: e.rank,
        benefit: BENEFITS[e.benefit],
        activities: e.activities.map((a) => ACTIVITIES[a]),
        description: e.description,
        times: e.times.map((x) => TIMES[x]),
        timesOther: e.timesOther,
        pay: PAYS[e.pay],
        amount: e.amount,
        hours: e.hours,
        details: e.details,
        max: yearMax(e),
      },
    },
    { headers }
  );
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const parsed = parseToken((await params).token);
  const limited = await enforce(parsed ? [[LIMITS.section38aIp, ipOf(req)], [LIMITS.section38aLink, parsed.target]] : [[LIMITS.section38aIp, ipOf(req)]]);
  if (limited) return limited;
  if (!parsed) return gone();
  const { year, target, secret } = parsed;
  const b = (await req.json().catch(() => null)) as { action?: unknown; dataUrl?: unknown; kind?: unknown; terms?: unknown; note?: unknown } | null;

  if (b?.action === "problem") {
    const note = typeof b.note === "string" ? b.note.trim().slice(0, 1000) : "";
    if (!note) return NextResponse.json({ error: "Say what is wrong." }, { status: 400 });
    let who = "";
    let tell = "";
    await changeYear(year, (y) => {
      const t = openLink(y, target, secret);
      if (t?.kind !== "employee" || y.lodged) return NO_CHANGE;
      who = nameOf(t);
      tell = t.entry.link?.sentByEmail ?? "";
      return { ...y, people: y.people.map((e) => (e.id === target ? { ...e, problem: { note, at: new Date().toISOString() } } : e)) };
    });
    if (!who) return gone();
    await recordActivity({ actorName: `${who} (signing link)`, action: "section38a.problem", entity: "section_38a", entityId: target, summary: `${who} reported a problem with their section 38A form for ${year}` });
    if (tell) await sendSection38aProblemEmail(tell, who, year, note);
    return NextResponse.json({ success: true });
  }

  const dataUrl = typeof b?.dataUrl === "string" ? b.dataUrl : "";
  try {
    decodeSignature(dataUrl);
  } catch (e) {
    if (e instanceof SignatureError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  const y = await getYear(year);
  const t = openLink(y, target, secret);
  if (!t) return gone();
  const outcome = await saveSignature(year, target, secret, termsOf, b?.terms, {
    name: nameOf(t),
    at: new Date().toISOString(),
    dataUrl,
    kind: b?.kind === "typed" ? "typed" : "drawn",
    ip: ipOf(req),
  });
  if (outcome === "gone") return gone();
  if (outcome === "locked") return NextResponse.json({ error: "This application has already been lodged." }, { status: 409 });
  if (outcome === "changed") return NextResponse.json({ error: "This changed while you had it open. Reload the page and read it again." }, { status: 409 });
  await recordActivity({ actorName: `${nameOf(t)} (signing link)`, action: "section38a.signed", entity: "section_38a", entityId: target, summary: `${nameOf(t)} signed section 38A ${t.kind === "chair" ? "undertaking" : "Form 1 Part B"} for ${year}`, detail: { kind: b?.kind === "typed" ? "typed" : "drawn" } });
  return NextResponse.json({ success: true }, { status: 201 });
}
