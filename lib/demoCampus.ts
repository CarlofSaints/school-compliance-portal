import { randomBytes, randomUUID } from "crypto";
import { getPeople, savePeople, type Person } from "./peopleData";
import { createUser, getUserByEmail } from "./userData";
import { LIBRARY, addLibraryCourse } from "./campusLibrary";
import { getModules, getTests, saveProgress } from "./trainingData";
import type { Attempt, Progress } from "./training";

// ---------------------------------------------------------------------------
// The demo school's Campus: every library course, the demo governing body as
// LOGINS, and invented progress so the leaderboard has something to show.
// Only ever called by the demo seed (platform admin, guarded, school named
// back), never on a real school.
//
// The logins use the demo's `.example` addresses and a random password that is
// never stored or shown, so nobody can sign in as them and no email can reach
// a real person.
// ---------------------------------------------------------------------------

/** How far each demo governor has got: modules completed, and their scores. Fixed, so a reset looks the same. */
const PROFILE: Record<string, { done: number; base: number }> = {
  "SGB Chairperson": { done: 11, base: 92 },
  Principal: { done: 10, base: 88 },
  "SGB Treasurer": { done: 8, base: 85 },
  "SGB Vice Chairperson": { done: 7, base: 80 },
  Secretary: { done: 6, base: 83 },
  "Deputy Principal": { done: 5, base: 78 },
  "Head of Fundraising": { done: 3, base: 74 },
  "Grounds and Building": { done: 1, base: 71 },
  "IT & E-learning": { done: 0, base: 0 },
};

const DAY = 86_400_000;

export async function seedDemoCampus(people: Person[]): Promise<{ users: number; courses: number; progress: number }> {
  let courses = 0;
  for (const c of LIBRARY) if ((await addLibraryCourse(c, "demo")) !== "already_added") courses++;

  // The governing body as logins, linked back to their register entries.
  const linked: Person[] = [];
  let users = 0;
  for (const p of people) {
    let user = await getUserByEmail(p.email);
    if (!user) {
      const [name, ...rest] = p.name.split(" ");
      user = await createUser({
        id: p.id.replace("person-", "user-"),
        name,
        surname: rest.join(" "),
        email: p.email,
        password: randomBytes(24).toString("hex"),
        role: p.position === "Principal" ? "sgb-admin" : "sgb-member",
        forcePasswordChange: true,
      });
      users++;
    }
    linked.push({ ...p, userId: user.id });
  }
  // Only the demo entries get their link; anybody else on the register (a real
  // person added for a demo) is left exactly as they are.
  const byId = new Map(linked.map((p) => [p.id, p]));
  await savePeople((await getPeople()).map((p) => byId.get(p.id) ?? p));

  // Modules in library order, each with its lessons and its test.
  const [modules, tests] = await Promise.all([getModules(), getTests()]);
  const order = LIBRARY.map((c) => modules.find((m) => m.librarySlug === c.slug)).filter((m) => m !== undefined);
  let progress = 0;
  for (const [i, p] of linked.entries()) {
    const profile = PROFILE[p.position] ?? { done: 2, base: 75 };
    const record: Progress = { userId: p.userId!, opened: {}, attempts: [] };
    order.forEach((m, at) => {
      if (at > profile.done) return;
      const when = (offset: number) => new Date(Date.now() - (40 - at * 3 - offset + i) * DAY).toISOString();
      const lessons = m.items.filter((x) => x.kind === "material");
      // The module after the last finished one is started: its first lesson read.
      for (const l of at === profile.done ? lessons.slice(0, 1) : lessons) record.opened[l.id] = when(0);
      if (at === profile.done) return;
      const test = tests.find((t) => t.id === m.items.find((x) => x.kind === "test")?.id);
      if (!test) return;
      const score = Math.min(100, profile.base + ((at * 7 + i * 3) % 15) - 4);
      const attempt = (pct: number, offset: number): Attempt => ({
        id: randomUUID(),
        testId: test.id,
        submittedAt: when(offset),
        pointsAwarded: Math.round((pct / 100) * test.questions.length),
        pointsPossible: test.questions.length,
        scorePct: Math.round((Math.round((pct / 100) * test.questions.length) / test.questions.length) * 100),
        passed: Math.round((pct / 100) * test.questions.length) / test.questions.length * 100 >= test.passMark,
        answers: [],
      });
      // Now and then a first try that did not pass, then a pass.
      if ((at + i) % 4 === 0) record.attempts.push(attempt(60, 1));
      record.attempts.push(attempt(Math.max(70, score), 2));
    });
    await saveProgress(record);
    progress++;
  }
  return { users, courses, progress };
}
