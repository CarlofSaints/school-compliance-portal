import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getMaterials, getModules, getProgress, getTests } from "@/lib/trainingData";
import { attemptsAt, hasPassed, isLocked, itemDone, liveKeys, readingMinutes } from "@/lib/training";
import { canManageTraining } from "@/lib/trainingAccess";
import { ensureLibraryDefaults } from "@/lib/campusLibrary";
import { inReaderLanguageLists } from "@/lib/campusTranslation";

export const dynamic = "force-dynamic";
// The first opening adds the course library (a few dozen writes).
// The background translation of free content runs after the response, inside this limit.
export const maxDuration = 300;

// The catalogue for whoever is asking: published training for everybody,
// drafts too for the people who build it. Each piece says whether THIS person
// has done it and whether it is still locked. No memo and no material body.
export async function GET(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  const manager = canManageTraining(session);
  // Library courses arrive by default the first time a school opens Campus.
  await ensureLibraryDefaults().catch((err) => console.error("[campus] library defaults failed:", err));

  const [english, progress] = await Promise.all([
    Promise.all([getMaterials(), getTests(), getModules()]),
    getProgress(session.id),
  ]);
  // In the reader's language (lib/campusTranslation.ts); free AI content still missing is translated in the background.
  const { materials, tests, modules, translating } = await inReaderLanguageLists({ materials: english[0], tests: english[1], modules: english[2] });
  const live = liveKeys(materials, tests);
  const visible = <T extends { status: string }>(list: T[]) => (manager ? list : list.filter((x) => x.status === "published"));

  const materialRows = visible(materials).map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    status: m.status,
    source: m.source,
    kind: m.kind,
    // From the English, as on the lesson page, so the two never disagree.
    minutes: readingMinutes(english[0].find((x) => x.id === m.id) ?? m),
    updatedAt: m.updatedAt,
    done: Boolean(progress.opened[m.id]),
    locked: !manager && isLocked(progress, modules, { kind: "material", id: m.id }, live),
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
      timeLimitMinutes: t.timeLimitMinutes ?? 0,
      attempts: mine.length,
      bestPct: mine.length ? Math.max(...mine.map((a) => a.scorePct)) : null,
      done: hasPassed(progress, t.id),
      locked: !manager && isLocked(progress, modules, { kind: "test", id: t.id }, live),
    };
  });
  const titles = new Map<string, { title: string; status: string; icon?: string; minutes?: number }>([
    ...materials.map((m) => [`material:${m.id}`, { ...m, minutes: readingMinutes(english[0].find((x) => x.id === m.id) ?? m) }] as const),
    ...tests.map((t) => [`test:${t.id}`, { ...t, minutes: t.timeLimitMinutes || undefined }] as const),
  ]);
  const moduleRows = visible(modules).map((m) => {
    const items = m.items
      .filter((i) => titles.has(`${i.kind}:${i.id}`) && (manager || titles.get(`${i.kind}:${i.id}`)!.status === "published"))
      .map((i) => ({
        ...i,
        title: titles.get(`${i.kind}:${i.id}`)!.title,
        status: titles.get(`${i.kind}:${i.id}`)!.status,
        icon: titles.get(`${i.kind}:${i.id}`)!.icon ?? (i.kind === "test" ? "📝" : "📖"),
        minutes: titles.get(`${i.kind}:${i.id}`)!.minutes ?? null,
        done: itemDone(progress, i),
        locked: !manager && isLocked(progress, modules, i, live),
      }));
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      topic: m.topic,
      status: m.status,
      source: m.source,
      sequential: m.sequential,
      icon: m.icon || "🎓",
      colour: m.colour || "violet",
      updatedAt: m.updatedAt,
      items,
      doneCount: items.filter((i) => i.done).length,
    };
  });

  return NextResponse.json(
    { canManage: manager, modules: moduleRows, materials: materialRows, tests: testRows, translating },
    { headers: { "Cache-Control": "no-store" } }
  );
}
