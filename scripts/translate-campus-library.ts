// Translates the course library ONCE into every language and writes
// lib/campusLibrary/translations/<locale>.json, which ships with the portal so
// every school (HVPS, Jeppe and every self-serve school) gets the library in
// any language at once, without translating it itself.
//
// Saves after every course, and skips what is already there, so it can be
// stopped and run again without paying twice. Run again after editing a course.
//
//   npx tsx --env-file=<file with ANTHROPIC_API_KEY> scripts/translate-campus-library.ts [locale ...]
import { readFileSync, writeFileSync } from "node:fs";
import { LIBRARY, libraryPieces } from "../lib/campusLibrary";
import { translateUnits, unitHash, unitOf, type CampusKind, type Unit } from "../lib/campusTranslation";
import type { Locale } from "../lib/i18n/locales";

const ALL: Locale[] = ["af", "zu", "xh", "nso", "tn", "st"];
const locales = (process.argv.slice(2).length ? process.argv.slice(2) : ALL) as Locale[];
const PARALLEL = 6;
const file = (l: Locale) => `lib/campusLibrary/translations/${l}.json`;

const out = new Map<Locale, Record<string, Unit>>(locales.map((l) => [l, JSON.parse(readFileSync(file(l), "utf8"))]));
const save = (l: Locale) => {
  const sorted = Object.fromEntries(Object.entries(out.get(l)!).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(file(l), JSON.stringify(sorted, null, 1) + "\n");
};

// Every piece of every course, exactly as a school's copy is built.
const courses = LIBRARY.map((course) => {
  const { lessons, test, module } = libraryPieces(course, "library");
  const pieces: { kind: CampusKind; unit: Unit }[] = [
    { kind: "module", unit: unitOf("module", { ...module, id: "x" } as never) },
    ...lessons.map((l) => ({ kind: "material" as const, unit: unitOf("material", l) })),
    { kind: "test", unit: unitOf("test", test) },
  ];
  return { slug: course.slug, pieces };
});

const jobs = locales.flatMap((l) => courses.map((c) => ({ l, c })));
let failed = 0;

async function run(job: (typeof jobs)[number]) {
  const have = out.get(job.l)!;
  const todo = job.c.pieces.filter((p) => !have[unitHash(p.unit)]);
  if (!todo.length) return;
  try {
    const translated = await translateUnits(job.l, todo.map((p) => p.unit), Date.now() + 15 * 60_000);
    todo.forEach((p, i) => (have[unitHash(p.unit)] = translated[i]));
    save(job.l);
    console.log(`ok   ${job.l} ${job.c.slug} (${todo.length} pieces)`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${job.l} ${job.c.slug}: ${err instanceof Error ? err.message.slice(0, 200) : err}`);
  }
}

(async () => {
  const queue = [...jobs];
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    for (let j = queue.shift(); j; j = queue.shift()) await run(j);
  }));
  for (const l of locales) console.log(`${l}: ${Object.keys(out.get(l)!).length} pieces`);
  console.log(failed ? `${failed} courses failed: run again to finish them` : "all done");
  process.exit(failed ? 1 : 0);
})();
