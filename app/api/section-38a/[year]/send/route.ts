import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { NO_CHANGE } from "@/lib/controlData";
import { sendSection38aLinkEmail } from "@/lib/email";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { approvalGaps, chairSigned, employeeSigned, setupGaps, type ChairLine } from "@/lib/section38a";
import { LOCKED, changeYear, getYear, guard, mintLink, sameEmail } from "@/lib/section38aData";
import { getTagMembers } from "@/lib/tagData";

// Emails one signer their link: an employee for Part B, or a chair for the
// undertaking. Sending again voids the last link.
export async function POST(req: NextRequest, { params }: { params: Promise<{ year: string }> }) {
  const auth = await guard(req, (await params).year);
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => null)) as { target?: unknown } | null;
  const target = typeof body?.target === "string" ? body.target : "";
  const y = await getYear(auth.year);
  if (y.lodged) return NextResponse.json({ error: LOCKED }, { status: 409 });

  const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
  let to: { name: string; email: string };
  let what: string;
  if (target === "sgb" || target === "finance") {
    const line: ChairLine = target;
    if (setupGaps(y).length || approvalGaps(y).length || !y.people.length) return bad("Finish the setup, the list and the SGB's approval first: the undertaking says the SGB has approved it.");
    const tagId = line === "sgb" ? y.sgbTagId : y.financeTagId;
    if (!tagId) return bad("Choose the tag for this chair in the setup.");
    const members = await getTagMembers(tagId);
    if (members.length !== 1 || !members[0].email) return bad("Exactly one person with an email address must carry this tag.");
    to = { name: members[0].name, email: members[0].email };
    // Only the same person: a new chair replaces the one who left.
    if (chairSigned(y, y.chairs[line]) && sameEmail(y.chairs[line]?.email, to.email)) return bad("This chair has already signed.", 409);
    what = `the undertaking by the ${line === "sgb" ? "SGB chairperson" : "finance committee chairperson"}`;
  } else {
    const entry = y.people.find((e) => e.id === target);
    if (!entry) return bad("That person is not on this list.", 404);
    if (!y.province) return bad("Give the province in the setup first: it appears on the form.");
    if (employeeSigned(y, entry)) return bad("This person has already signed.", 409);
    to = { name: `${entry.name} ${entry.surname}`, email: entry.email };
    what = "Form 1 Part B, your application for additional work";
  }
  const limited = await enforce([[LIMITS.signCodeSend, `38a|${auth.year}|${target}`]]);
  if (limited) return limited;

  const { token, link } = mintLink(auth.year, target, { name: `${auth.session.name} ${auth.session.surname}`.trim(), email: auth.session.email });
  // Emailed first: a failed send must leave the link they already have working.
  if (!(await sendSection38aLinkEmail(to.email, to.name, auth.year, what, token))) return bad("The email could not be sent. Please try again.", 502);
  let locked = false;
  await changeYear(auth.year, (fresh) => {
    locked = !!fresh.lodged;
    if (locked) return NO_CHANGE;
    if (target !== "sgb" && target !== "finance") return { ...fresh, people: fresh.people.map((e) => (e.id === target ? { ...e, link, problem: undefined } : e)) };
    const before = fresh.chairs[target];
    const kept = sameEmail(before?.email, to.email) ? before?.signature : undefined;
    return { ...fresh, chairs: { ...fresh.chairs, [target]: { ...to, link, ...(kept ? { signature: kept } : {}) } } };
  });
  if (locked) return bad(LOCKED, 409);
  await recordActivity({ ...actorFrom(req, auth.session), action: "section38a.link_sent", entity: "section_38a", entityId: target, summary: `Sent a section 38A signing link to ${to.name} for ${auth.year}` });
  return NextResponse.json({ success: true });
}
