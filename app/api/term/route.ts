import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getUserById } from "@/lib/userData";
import { getPeople } from "@/lib/peopleData";
import { headsByLink, termDatesProblem, todaySast } from "@/lib/governanceTerm";
import { applyTermLockIfDue, getTerms, keepHeadsOn, saveTerm, setMemberState, termRoster, type TermAction } from "@/lib/governanceTermData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import type { SessionPayload } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * Anybody given the key (or manage_users), or the Principal / Deputy: linked to
 * that position on the register BY LOGIN and ticked to keep access by a
 * manager. Both are needed, so editing the People register alone grants nothing.
 */
async function mayManage(session: SessionPayload): Promise<boolean> {
  if (session.permissions.includes("manage_sgb_term") || session.permissions.includes("manage_users")) return true;
  const user = await getUserById(session.id);
  return Boolean(user?.keepsAccessAfterTerm && headsByLink(user, await getPeople()));
}

async function guard(req: NextRequest): Promise<SessionPayload | NextResponse> {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  if (!(await mayManage(session))) return NextResponse.json({ error: "Only the Principal or Deputy Principal can manage the term." }, { status: 403 });
  return session;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (session instanceof NextResponse) return session;
  await applyTermLockIfDue({ force: true }).catch(() => false);
  const [terms, roster] = await Promise.all([getTerms(), termRoster()]);
  return NextResponse.json({ terms, roster, today: todaySast(), me: session.id }, { headers: { "Cache-Control": "no-store" } });
}

// { startDate, endDate, mode: "edit" | "new" }
export async function PUT(req: NextRequest) {
  const session = await guard(req);
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => ({}));
  const problem = termDatesProblem(body.startDate, body.endDate, todaySast());
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const mode = body.mode === "new" ? "new" : "edit";
  const saved = await saveTerm(body.startDate, body.endDate, mode);
  if (saved === "locked") {
    return NextResponse.json({ error: "This term has ended and members are locked. Start the new term instead." }, { status: 409 });
  }
  // The Principal and Deputy (linked by login on the register) keep access.
  const kept = await keepHeadsOn();
  await recordActivity({
    ...actorFrom(req, session),
    action: mode === "new" ? "term.started" : "term.updated",
    entity: "user",
    summary: `${mode === "new" ? "Started a new term" : "Changed the term dates"}: ${body.startDate} to ${body.endDate}${
      kept.length ? ` (${kept.length} Principal/Deputy set to keep access)` : ""
    }`,
  });
  return NextResponse.json(saved);
}

const ACTIONS: TermAction[] = ["switch_on", "retire", "keep_access", "no_keep_access"];
const LABELS: Record<TermAction, string> = {
  switch_on: "Switched back on",
  retire: "Retired",
  keep_access: "Set to keep access when a term ends",
  no_keep_access: "Set to be locked when a term ends",
};

// { userId, action }
export async function POST(req: NextRequest) {
  const session = await guard(req);
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => ({}));
  const action = ACTIONS.includes(body.action) ? (body.action as TermAction) : null;
  const target = typeof body.userId === "string" ? await getUserById(body.userId) : undefined;
  if (!action || !target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (action === "retire" && target.id === session.id) {
    return NextResponse.json({ error: "You cannot retire yourself." }, { status: 400 });
  }
  if (action === "retire" && target.role === "super-admin") {
    return NextResponse.json({ error: "A Super Admin cannot be retired here." }, { status: 400 });
  }
  const saved = await setMemberState(target.id, action);
  if (!saved) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await recordActivity({
    ...actorFrom(req, session),
    action: `term.member.${action}`,
    entity: "user",
    entityId: target.id,
    summary: `${LABELS[action]}: ${target.name} ${target.surname}`.trim(),
  });
  return NextResponse.json({ ok: true });
}
