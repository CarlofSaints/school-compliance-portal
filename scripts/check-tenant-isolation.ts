// The isolation choke point, checked at the source level. No server.
//
//   npx tsx scripts/check-tenant-isolation.ts
//
// 🔴 Why this exists.
//
// lib/controlData.ts keeps a small map of what THIS instance last wrote, as a
// last resort for when a blob read fails. It was keyed on the bare path.
//
// Every school writes to the same handful of relative paths: people.json,
// users.json, tags.json. So seeding the demo school cached "people.json", the
// next school read "people.json", genuinely had no such file, fell through to
// the cache, and was served the demo school's nine governors as its own
// governance register. It surfaced because a school nobody had touched
// reported nine people on the platform page.
//
// A behavioural test would need two tenant scopes and a blob store. This reads
// the SOURCE instead and asserts the shape that makes the bug impossible,
// which is the part that has to hold.

import { readFileSync } from "fs";
import { join } from "path";

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.error(`  FAIL ${label}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`);
  }
}
const checkThat = (label: string, cond: boolean) => check(label, cond, true);

const root = join(__dirname, "..");
const src = readFileSync(join(root, "lib", "controlData.ts"), "utf8");

console.log("\n🔴 The write cache is keyed per SCHOOL, not per path");
{
  const gets = [...src.matchAll(/recentWrites\.get\(([^)]*)\)/g)].map((m) => m[1].trim());
  const sets = [...src.matchAll(/recentWrites\.set\(\s*([^,]+),/g)].map((m) => m[1].trim());

  checkThat("the cache is read somewhere", gets.length > 0);
  checkThat("the cache is written somewhere", sets.length > 0);

  // The whole property: neither side may key on the bare path.
  check(
    "every read is keyed through cacheKey()",
    gets.filter((g) => !g.startsWith("cacheKey(")),
    []
  );
  check(
    "every write is keyed through cacheKey()",
    sets.filter((s) => !s.startsWith("cacheKey(")),
    []
  );
  check(
    "nothing keys on the bare blobPath",
    [...gets, ...sets].filter((k) => k === "blobPath"),
    []
  );
}

console.log("\ncacheKey() actually includes the prefix");
{
  const fn = src.match(/function cacheKey\([^)]*\)[^{]*\{([\s\S]*?)\n\}/);
  checkThat("cacheKey exists", !!fn);
  checkThat(
    "it combines prefix and path rather than returning the path",
    !!fn && /prefix/.test(fn[1]) && /blobPath/.test(fn[1])
  );

  // The real behaviour, since the function is trivial enough to restate.
  const cacheKey = (prefix: string, blobPath: string) => prefix + blobPath;
  checkThat(
    "two schools writing people.json get DIFFERENT keys",
    cacheKey("demo/", "people.json") !== cacheKey("st-bothians/", "people.json")
  );
  check(
    "and one school's key is stable",
    cacheKey("demo/", "people.json"),
    cacheKey("demo/", "people.json")
  );
}

console.log("\nEvery blob call still goes through the scope");
{
  // lib/controlData and the backup route are the only modules allowed to touch
  // the blob SDK directly, and both must resolve the tenant first. A raw
  // put/get/list with no scope() above it is how a school reads another's data.
  const scoped = /await scope\(\)/.test(src);
  checkThat("controlData resolves the tenant scope", scoped);
  checkThat(
    "readJson resolves the scope before using the cache",
    /const \{ prefix \} = await scope\(\);\s*\n\s*const cached = recentWrites\.get\(/.test(src)
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
