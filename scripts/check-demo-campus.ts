// Seeds the demo Campus into the FAKE store and checks the leaderboard it gives.
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-demo-campus.ts
import assert from "node:assert/strict";
import { demoPeople } from "../lib/demoData";
import { seedDemoCampus } from "../lib/demoCampus";
import { allProgress, getMaterials, getModules, getTests } from "../lib/trainingData";
import { buildLeaderboard } from "../lib/training";
import { getPeople, savePeople } from "../lib/peopleData";

(async () => {
  const real = { id: "real-1", position: "Deputy Principal", userId: null, name: "Real Person", email: "real@outerjoin.co.za", phone: "", profilePic: "" };
  await savePeople([...demoPeople(), real]);
  const first = await seedDemoCampus(demoPeople());
  assert.equal(first.courses, 11);
  assert.equal(first.users, 9);
  const again = await seedDemoCampus(demoPeople());
  assert.deepEqual([again.courses, again.users], [0, 0], "a reset adds no second copy of a course or a login");
  const reg = await getPeople();
  assert.ok(reg.filter((p) => p.email.endsWith(".example")).every((p) => p.userId), "every demo entry linked to its login");
  assert.deepEqual(reg.find((p) => p.id === "real-1"), real, "a real person on the register is left exactly as they were");

  const [{ users, progress }, tests, modules, materials] = await Promise.all([allProgress(), getTests(), getModules(), getMaterials()]);
  assert.equal(modules.filter((m) => m.status === "published").length, 11);
  const rows = buildLeaderboard(users, progress, tests, modules, materials);
  for (const r of rows) console.log(`${r.rank}. ${r.name}: ${r.points} pts, ${r.testsPassed} passed, ${r.modulesCompleted} modules, avg ${r.averagePct ?? "-"}%`);
  assert.equal(rows[0].name, "Fatima Adams", "the chair finished everything");
  assert.equal(rows[0].modulesCompleted, 11);
  assert.equal(rows.at(-1)!.points, 0, "one governor has not started");
  console.log("demo campus: all checks passed");
})();
