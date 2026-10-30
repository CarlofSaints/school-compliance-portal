import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getMaterials, getModules, getProgress, getTests } from "@/lib/trainingData";
import { attemptsAt, hasPassed, isLocked, itemDone } from "@/lib/training";
import { canManageTraining } from "@/lib/trainingAccess";

export const dynamic = "force-dynamic";

// The catalogue for whoever is asking: published training for everybody,
// drafts too for the people who build it. Each piece says whether THIS person
// has done it and whether it is still locked. No memo and no material body.
export async function GET(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  const manager = canManageTraining(session);

  const [materials, tests, modules, progress] = await Promise.all([
    getMaterials(),
    getTests(),
    getModules(),
    getProgress(session.id),
  ]);
  const visible = <T extends { status: string }>(list: T[]) => (manager ? list : list.filter((x) => x.status === "published"));

  const materialRows = visible(materials).map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    status: m.status,
    source: m.source,
    kind: m.kind,
    updatedAt: m.updatedAt,
    done: Boolean(progress.opened[m.id]),
    locked: !manager && isLocked(progress, modules, { kind: "material", id: m.id }),
  }));
  const testRows = visible(tests).map((t) => {
    const mine = attemptsAt(progress, t.id);
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      source: t.source,
      updatedAt: t.updatedAt,
      questionCount: t.questions.length,
      passMark: t.passMark,
      maxAttempts: t.maxAttempts,
      attempts: mine.length,
      bestPct: mine.length ? Math.max(...mine.map((a) => a.scorePct)) : null,
      done: hasPassed(progress, t.id),
      locked: !manager && isLocked(progress, modules, { kind: "test", id: t.id }),
    };
  });
  const titles = new Map<string, { title: string; status: string }>([
    ...materials.map((m) => [`material:${m.id}`, m] as const),
    ...tests.map((t) => [`test:${t.id}`, t] as const),
  ]);
  const moduleRows = visible(modules).map((m) => {
    const items = m.items
      .filter((i) => titles.has(`${i.kind}:${i.id}`) && (manager || titles.get(`${i.kind}:${i.id}`)!.status === "published"))
      .map((i) => ({
        ...i,
        title: titles.get(`${i.kind}:${i.id}`)!.title,
        status: titles.get(`${i.kind}:${i.id}`)!.status,
        done: itemDone(progress, i),
        locked: !manager && isLocked(progress, modules, i),
      }));
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      topic: m.topic,
      status: m.status,
      source: m.source,
      sequential: m.sequential,
      updatedAt: m.updatedAt,
      items,
      doneCount: items.filter((i) => i.done).length,
    };
  });

  return NextResponse.json(
    { canManage: manager, modules: moduleRows, materials: materialRows, tests: testRows },
    { headers: { "Cache-Control": "no-store" } }
  );
}
