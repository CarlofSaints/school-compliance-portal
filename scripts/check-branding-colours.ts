// Proves the palette rules with no server and no browser.
//
//   npx tsx scripts/check-branding-colours.ts
//
// A school picks two colours on a form. Everything else about how the portal
// looks is derived from them, so the derivation is worth pinning down.

import {
  normaliseHex,
  shade,
  contrastRatio,
  luminance,
  readableTextOn,
  checkColours,
  derivePalette,
  colourDistance,
} from "../lib/brandingColors";

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
function checkThat(label: string, condition: boolean) {
  check(label, condition, true);
}

console.log("\nHex input is forgiving, because it comes off a form");
{
  check("with hash", normaliseHex("#00BCD4"), "#00bcd4");
  check("without hash", normaliseHex("00BCD4"), "#00bcd4");
  check("shorthand expands", normaliseHex("#abc"), "#aabbcc");
  check("padded", normaliseHex("  #00BCD4  "), "#00bcd4");
  check("empty is null", normaliseHex(""), null);
  check("null is null", normaliseHex(null), null);
  check("a colour name is null", normaliseHex("red"), null);
  check("too short is null", normaliseHex("#ab"), null);
  check("too long is null", normaliseHex("#aabbccdd"), null);
  check("not hex is null", normaliseHex("#gggggg"), null);
}

console.log("\nContrast maths matches the known WCAG anchors");
{
  check("black on white is 21", Math.round(contrastRatio("#000000", "#ffffff")), 21);
  check("identical is 1", contrastRatio("#123456", "#123456"), 1);
  check("order does not matter", contrastRatio("#000", "#fff"), contrastRatio("#fff", "#000"));
  checkThat("white luminance is 1", Math.abs(luminance("#ffffff") - 1) < 0.001);
  checkThat("black luminance is 0", luminance("#000000") < 0.001);
}

console.log("\nText on a brand colour stays readable - the actual point");
{
  check("white on HVPS cyan", readableTextOn("#00BCD4"), "#1a1a1a");
  check("white on Jeppe black", readableTextOn("#000000"), "#ffffff");
  check("dark text on Jeppe yellow", readableTextOn("#fcb517"), "#1a1a1a");
  check("white on navy", readableTextOn("#1e3a8a"), "#ffffff");
  check("dark on white", readableTextOn("#ffffff"), "#1a1a1a");

  // The guarantee that matters: whatever a school picks, the label on its own
  // buttons is legible. 4.5 is the WCAG AA threshold for normal text.
  const brands = ["#00BCD4", "#000000", "#fcb517", "#1e3a8a", "#ffffff", "#7c3aed",
                  "#dc2626", "#16a34a", "#f0abfc", "#84cc16", "#0f172a", "#fef08a"];
  for (const b of brands) {
    const ratio = contrastRatio(b, readableTextOn(b));
    checkThat(`${b} button text reaches AA (${ratio.toFixed(1)}:1)`, ratio >= 4.5);
  }
}

console.log("\nShading moves the right way");
{
  checkThat("darkening lowers luminance", luminance(shade("#00BCD4", -0.3)) < luminance("#00BCD4"));
  checkThat("lightening raises luminance", luminance(shade("#00BCD4", 0.3)) > luminance("#00BCD4"));
  check("no change is the same colour", shade("#00bcd4", 0), "#00bcd4");
  check("fully dark is black", shade("#00bcd4", -1), "#000000");
  check("fully light is white", shade("#00bcd4", 1), "#ffffff");
  check("black cannot darken past black", shade("#000000", -0.5), "#000000");
  check("white cannot lighten past white", shade("#ffffff", 0.5), "#ffffff");
}

console.log("\nThe derived palette");
{
  const hvps = derivePalette("#00BCD4", "#00BCD4");
  check("primary is kept", hvps.primary, "#00bcd4");
  checkThat("primaryDark is darker", luminance(hvps.primaryDark) < luminance(hvps.primary));
  checkThat("primaryTint is lighter", luminance(hvps.primaryTint) > luminance(hvps.primary));
  check("a mid brand gets the neutral dark", hvps.dark, "#1a1a1a");

  const jeppe = derivePalette("#000000", "#fcb517");
  check("a black brand keeps a black sidebar", jeppe.dark, "#000000");
  check("accent survives untouched", jeppe.accent, "#fcb517");
  check("white text on black", jeppe.onPrimary, "#ffffff");

  const pale = derivePalette("#fef08a", "#1e3a8a");
  check("a pale brand flips to dark text", pale.onPrimary, "#1a1a1a");

  const noAccent = derivePalette("#00BCD4", "");
  check("a missing accent falls back to primary", noAccent.accent, "#00bcd4");

  const rubbish = derivePalette("not-a-colour", "also-not");
  check("rubbish falls back to a neutral rather than crashing", rubbish.primary, "#475569");

  // Every derived value must be a real hex, or the CSS variable silently breaks
  // and the whole page loses its colours.
  for (const [k, v] of Object.entries(derivePalette("#7c3aed", "#f0abfc"))) {
    checkThat(`${k} is a valid hex (${v})`, normaliseHex(v) === v);
  }
}

console.log("\nWarnings say something useful");
{
  check("a good pair warns about nothing", checkColours("#00BCD4", "#fcb517").length, 0);
  check("bad main is an error", checkColours("nope", "#fcb517")[0]?.level, "error");
  check("bad accent is an error", checkColours("#00BCD4", "nope")[0]?.level, "error");
  checkThat(
    "a pale main warns",
    checkColours("#fef08a", "#1e3a8a").some((w) => w.message.includes("very light"))
  );
  checkThat(
    "a dark accent on a dark sidebar warns",
    checkColours("#00BCD4", "#050505").some((w) => w.message.includes("barely show"))
  );
  checkThat(
    "two identical colours warn",
    checkColours("#00BCD4", "#00BCD5").some((w) => w.message.includes("almost identical"))
  );
  // The regression that caught the first version: cyan and yellow sit at only
  // 1.29:1 contrast because their LUMINANCE is close, but they are plainly
  // different colours. Judging sameness by contrast told HVPS cyan and Jeppe
  // yellow they were almost identical.
  checkThat(
    "very different hues at similar brightness do NOT warn",
    !checkColours("#00BCD4", "#fcb517").some((w) => w.message.includes("almost identical"))
  );
  checkThat("cyan vs yellow are far apart", colourDistance("#00BCD4", "#fcb517") > 200);
  checkThat("a one-step change is close", colourDistance("#00BCD4", "#00BCD5") < 5);
  checkThat(
    "no warning mentions a hex code the user did not type",
    checkColours("#fef08a", "#050505").every((w) => !w.message.includes("#"))
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
