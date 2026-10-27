// The standard guide every school starts with, checked without a server.
//
//   npx tsx scripts/check-default-guide.ts
//
// 🔴 The rule that matters: NO IMAGES. The guide HVPS published embeds 19
// screenshots of a real school's register, project names and CAPEX figures.
// If this document ever gains an <img>, one school's records are being served
// to every other school on the platform.

import { existsSync } from "fs";
import { join } from "path";
import { buildDefaultGuide } from "../lib/defaultGuide";
import type { SchoolBranding } from "../lib/branding";

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

const branding = {
  fullName: "St Bothians",
  colors: { primary: "#0891b2", dark: "#0f172a" },
} as unknown as SchoolBranding;

const html = buildDefaultGuide(branding);

console.log("\n🔴 It carries no school's data but the reader's own");
{
  check("no images at all", (html.match(/<img/g) || []).length, 0);
  check("nothing embedded as a data uri", (html.match(/data:image/g) || []).length, 0);
  checkThat("never names another school", !/Hurlyvale|HVPS|Jeppe/i.test(html));
  checkThat("names the school reading it", html.includes("St Bothians"));
}

console.log("\nIt is a complete standalone document");
{
  checkThat("has a doctype", /^<!doctype html>/i.test(html));
  checkThat("has a title", /<title>[^<]+<\/title>/.test(html));
  // It renders inside a sandboxed iframe with no access to the portal's CSS,
  // so it has to bring its own or it arrives as unstyled text.
  checkThat("brings its own stylesheet", /<style>/.test(html));
  checkThat("uses the school's own colour", html.includes("#0891b2"));
}

console.log("\nEvery contents entry reaches a chapter");
{
  const chapters = [...html.matchAll(/<section class="chapter" id="(ch\d+)"/g)].map((m) => m[1]);
  const links = [...html.matchAll(/href="#(ch\d+)"/g)].map((m) => m[1]);
  checkThat("there are chapters", chapters.length >= 10);
  check("one rail link per chapter", links.length, chapters.length);
  check("no dead links", links.filter((l) => !chapters.includes(l)), []);
  check("no duplicate ids", new Set(chapters).size, chapters.length);
}

console.log("\nIt covers what the portal actually does");
{
  for (const topic of [
    "Signing the minutes",
    "Action items",
    "Applying for funds",
    "Running a compliance check",
    "Policies",
  ]) {
    checkThat(`covers ${topic}`, html.includes(topic));
  }
}

console.log("\nCustomer-facing copy rules");
{
  // See [[no-ai-tells-in-customer-copy]]. Schools read this document.
  check("no em dashes", (html.match(/—/g) || []).length, 0);
  // 🔴 Asserts the DISCLAIMER IS PRESENT rather than trying to prove a claim is
  // absent. The first attempt at this checked for the absence of "makes the
  // school compliant" and failed on the very sentence that says it does NOT:
  // a negative regex cannot see a "not" in front of the thing it matched, and a
  // test that only ever proves an absence passes just as happily when the whole
  // document is missing.
  checkThat(
    "says plainly that a check does not make a school compliant",
    /does not make the school compliant/i.test(html)
  );
  checkThat("and that it is not legal advice", /not legal advice/i.test(html));
}

console.log("\nA school name with markup in it cannot break the page");
{
  const nasty = buildDefaultGuide({
    fullName: 'St <script>alert(1)</script> "Bothians" & Co',
    colors: { primary: "#000000", dark: "#111111" },
  } as unknown as SchoolBranding);
  checkThat("the script tag is escaped", !nasty.includes("<script>alert(1)</script>"));
  checkThat("it is present as text", nasty.includes("&lt;script&gt;"));
  checkThat("quotes and ampersands survive", nasty.includes("&quot;Bothians&quot; &amp; Co"));
}

// Carl, 26 Oct: "nothing in the guide translates when i switch languages".
console.log("\n🔴 Every language gets the WHOLE guide, in that language");
{
  const tags = (s: string) => (s.match(/<[a-z0-9]+[ >]/g) || []).sort().join();
  const english = buildDefaultGuide(branding, "en");
  for (const code of ["af", "zu", "xh", "nso", "tn", "st"] as const) {
    const g = buildDefaultGuide(branding, code);
    checkThat(`${code}: marked as ${code}`, g.includes(`<html lang="${code}">`));
    checkThat(`${code}: not the English text`, !g.includes("Everyone who uses the portal has their own login"));
    check(`${code}: same chapters and markup as English`, tags(g), tags(english));
    checkThat(`${code}: no em dashes`, !g.includes("—"));
    checkThat(`${code}: names the school`, g.includes("St Bothians"));
    checkThat(`${code}: no image`, !/<img|data:image/.test(g));
  }
  checkThat("covers room bookings", english.includes("Booking a meeting room"));
  checkThat("a private school reads Board, not SGB", buildDefaultGuide({ ...branding, schoolType: "private" } as SchoolBranding).includes("the Board register"));
}

console.log("\nVideo links in the guide");
{
  const g = buildDefaultGuide(branding, "af", "https://demo.example");
  const ids = [...g.matchAll(/href="https:\/\/demo\.example\/tutorials\/([a-z-]+)\.mp4"/g)].map((m) => m[1]);
  checkThat("links every clip but the Guide's own", ids.length === 30);
  check("each link has its clip", ids.filter((id) => !existsSync(join(__dirname, "..", "public", "tutorials", `${id}.mp4`))), []);
  checkThat("labels are translated", g.includes("Kyk hoe"));
  checkThat(
    "signing sits under Signing the minutes",
    /Signing the minutes[\s\S]{0,400}tutorials\/signing\.mp4/.test(buildDefaultGuide(branding, "en"))
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
