import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { getGuests, getShareLinks, guestProgressId, linkScope, setShareActive } from "@/lib/campusShare";
import { getMaterials, getProgress, getTests } from "@/lib/trainingData";
import { attemptsAt, hasPassed } from "@/lib/training";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string }> };

// Who came in through this link and how far each got. Every name here was
// typed by the guest and is checked against nothing.
export async function GET(req: NextRequest, { params }: Ctx) {
  const session = await requirePermission(req, "manage_training");
  if (session instanceof NextResponse) return session;
  const { token } = await params;
  const link = (await getShareLinks()).find((l) => l.token === token);
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [guests, scope, materials, tests] = await Promise.all([getGuests(token), linkScope(link), getMaterials(), getTests()]);
  const lessonIds = materials.filter((m) => scope.has(`material:${m.id}`)).map((m) => m.id);
  const testList = tests.filter((t) => scope.has(`test:${t.id}`));
  const rows = await Promise.all(
    guests.map(async (g) => {
      const p = await getProgress(guestProgressId(g.id));
      return {
        name: `${g.name} ${g.surname}`.trim(),
        email: g.email,
        joinedAt: g.joinedAt,
        lessonsRead: lessonIds.filter((id) => p.opened[id]).length,
        tests: testList.map((t) => {
          const mine = attemptsAt(p, t.id);
          return { title: t.title, attempts: mine.length, bestPct: mine.length ? Math.max(...mine.map((a) => a.scorePct)) : null, passed: hasPassed(p, t.id) };
        }),
      };
    })
  );
  return NextResponse.json({ link, lessons: lessonIds.length, rows }, { headers: { "Cache-Control": "no-store" } });
}

// { active: boolean }: switch a link off (or back on). Results are kept.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await requirePermission(req, "manage_training");
  if (session instanceof NextResponse) return session;
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const saved = await setShareActive(token, body.active === true);
  if (!saved) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await recordActivity({
    ...actorFrom(req, session),
    action: saved.active ? "training.share.on" : "training.share.off",
    entity: "training",
    entityId: saved.targetId,
    summary: `${saved.active ? "Switched on" : "Switched off"} a Campus share link${saved.label ? ` (${saved.label})` : ""}`,
  });
  return NextResponse.json(saved);
}
