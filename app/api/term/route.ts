import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getUserById } from "@/lib/userData";
import { getPeople } from "@/lib/peopleData";
import { positionsOf, termDatesProblem, todaySast, TERM_EXEMPT_POSITIONS } from "@/lib/governanceTerm";
import { applyTermLockIfDue, getTerms, saveTerm, setMemberState, termRoster, type TermAction } from "@/lib/governanceTermData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import type { SessionPayload } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** The Principal and Deputy by position, or anybody given the key (or manage_users). */
async function mayManage(session: SessionPayload): Promise<boolean> {
  if (session.permissions.includes("manage_sgb_term") || session.permissions.includes("manage_users")) return true;
  const user = await getUserById(session.id);
  return Boolean(user && positionsOf(user, await getPeople()).some((p) => TERM_EXEMPT_POSITIONS.includes(p)));
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
  const problem = termDatesProblem(body.startDate, body.endDate);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const mode = body.mode === "new" ? "new" : "edit";
  const saved = await saveTerm(body.startDate, body.endDate, mode);
  if (saved === "locked") {
    return NextResponse.json({ error: "This term has ended and members are locked. Start the new term instead." }, { status: 409 });
  }
  await recordActivity({
    ...actorFrom(req, session),
    action: mode === "new" ? "term.started" : "term.updated",
    entity: "user",
    summary: `${mode === "new" ? "Started a new term" : "Changed the term dates"}: ${body.startDate} to ${body.endDate}`,
  });
  return NextResponse.json(saved);
}

const ACTIONS: TermAction[] = ["switch_on", "retire", "unretire", "keep_access", "no_keep_access"];
const LABELS: Record<TermAction, string> = {
  switch_on: "Switched back on",
  retire: "Retired",
  unretire: "Un-retired",
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
