// "Compile a policy from scratch": the form is checked before any AI call, and
// the draft becomes a Word file on the school's letterhead (crest, name,
// footer text, page numbers) with its headings and bullets intact.
//
//   npx tsx scripts/check-policy-compile.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { branding } from "../lib/branding";
import { cleanCompileRequest, policyDocx, policyFilename } from "../lib/policyCompile";

(async () => {
  const ok = { name: "Cellphone Policy", description: "Phones in class", comply: ["sasa", "bela", "nonsense"], province: "", guidelineIds: [] };
  const req = cleanCompileRequest(ok);
  assert.ok(typeof req !== "string");
  assert.deepEqual(req.comply, ["sasa", "bela"], "unknown choices are dropped");
  assert.equal(typeof cleanCompileRequest({ ...ok, name: " " }), "string", "a name is required");
  assert.equal(typeof cleanCompileRequest({ ...ok, description: "" }), "string", "a description is required");
  assert.equal(typeof cleanCompileRequest({ ...ok, comply: [] }), "string", "something to comply with is required");
  assert.equal(typeof cleanCompileRequest({ ...ok, comply: ["provincial"], province: "Atlantis" }), "string", "a real province is required");
  assert.ok(typeof cleanCompileRequest({ ...ok, comply: [], guidelineIds: ["g1"] }) !== "string", "an uploaded guideline alone is enough");
  assert.equal(policyFilename('A/B: "C"?'), "A B C .docx".replace(" .", "."), "no characters Windows refuses in a file name");

  const school = { ...branding, fullName: "Test Primary School", wordFooter: "12 Main Road\nReg 123" };
  const crest = readFileSync("public/logo.png");
  const text = "# Cellphone Policy\n\n# 1. Purpose\n\nThis policy sets out the rules.\n\n## 1.1 Scope\n\n- Learners\n- Staff\n\nControl char \u0007 gone.";
  const docx = await policyDocx("Cellphone Policy", text, school, crest);
  const zip = await JSZip.loadAsync(docx);
  const body = await zip.file("word/document.xml")!.async("string");
  assert.ok(body.includes("Test Primary School"), "school name on the letterhead");
  assert.ok(body.includes("1.1 Scope") && body.includes("Heading2"), "sub-headings kept as headings");
  assert.ok(body.includes("<w:numPr>"), "bullets kept as a list");
  assert.ok(!body.includes("\u0007"), "control characters removed so Word opens the file");
  assert.ok(Object.keys(zip.files).some((f) => f.startsWith("word/media/")), "crest embedded");
  const footer = await Promise.all(Object.keys(zip.files).filter((f) => /word\/footer\d*\.xml/.test(f)).map((f) => zip.file(f)!.async("string")));
  assert.ok(footer.join("").includes("12 Main Road") && footer.join("").includes("PAGE"), "school footer and page numbers");
  assert.ok((await policyDocx("No crest", text, school, null)).length > 0, "a school without a crest still gets its Word file");
  console.log("policy compile: all checks passed");
})();
