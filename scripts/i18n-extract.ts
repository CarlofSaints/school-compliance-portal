// Lists every t("...") / tk("...") string in the app and what each language
// is missing. Run after adding UI text:
//
//   npx tsx scripts/i18n-extract.ts            report only, exits 1 if anything is broken
//   npx tsx scripts/i18n-extract.ts out/       also writes out/<lang>.missing.json to translate
//
// A t() whose first argument is not a plain string literal (a variable, a
// template with ${}) can never match a dictionary key, so it is reported.
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { LOCALES } from "../lib/i18n/locales";

const ROOTS = ["app", "components", "lib"];
const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(f)) files.push(p);
  }
};
ROOTS.forEach(walk);

const keys = new Set<string>();
const broken: string[] = [];
// t( or tk( not preceded by an identifier character or a dot (so .split( / format( / it( are skipped).
const CALL = /(?<![\w.$])tk?\(\s*/g;
for (const f of files) {
  // Whole-line comments blanked, line numbers kept.
  const src = readFileSync(f, "utf8").replace(/^[ \t]*\/\/.*$/gm, "");
  for (const m of src.matchAll(CALL)) {
    const rest = src.slice(m.index! + m[0].length);
    const lit = /^("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\$]|\\.)*`)/.exec(rest);
    if (lit) {
      const raw = lit[1];
      const body = raw.slice(1, -1);
      keys.add(raw[0] === '"' ? JSON.parse(raw) : JSON.parse(JSON.stringify(body).replace(/\\(['`])/g, "$1")));
      continue;
    }
    // Anything else is a lookup (a tk()-marked label, or a data value), which
    // is allowed. Only two shapes are certain misses: a template with ${...},
    // and a ternary between string literals (whose literals go unextracted).
    const arg = rest.split("\n")[0];
    if (!/^`[^`]*\$\{/.test(arg) && !/\s\?\s*["'][^"']*["']\s*:/.test(arg)) continue;
    const line = src.slice(0, m.index).split("\n").length;
    broken.push(`${f}:${line}  ${rest.slice(0, 60).split("\n")[0]}`);
  }
}

console.log(`${keys.size} strings in ${files.length} files`);
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
for (const { code } of LOCALES.filter((l) => l.code !== "en")) {
  const dict = JSON.parse(readFileSync(`lib/i18n/dictionaries/${code}.json`, "utf8"));
  const missing = [...keys].filter((k) => !dict[k]);
  const unused = Object.keys(dict).filter((k) => !keys.has(k));
  console.log(`${code}: ${missing.length} missing, ${unused.length} unused`);
  if (out) writeFileSync(join(out, `${code}.missing.json`), JSON.stringify(missing, null, 2));
}
if (broken.length) {
  console.log(`\n${broken.length} t() calls that can never match a key:`);
  broken.forEach((b) => console.log("  " + b));
  process.exitCode = 1;
}
