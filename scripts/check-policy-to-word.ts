// Checks the scanned-policy-to-Word converter's text handling and that the
// result is a real Word file. No AI call, no blob.
//
//   npx tsx scripts/check-policy-to-word.ts
import assert from "node:assert/strict";
import JSZip from "jszip";
import { parseTranscript, transcriptToDocx } from "../lib/policyToWord";

const sample = "# Admissions Policy\r\n\r\n## 1. Purpose\nThe school admits learners\nin line with SASA.\n\n- Age\n• Zone\n\n4.2.1 Fees are R1 200 & <due>.\u0001";
const lines = parseTranscript(sample);
assert.deepEqual(lines.map((l) => l.kind), ["h1", "h2", "para", "para", "bullet", "bullet", "para"]);
assert.equal(lines[0].text, "Admissions Policy");
assert.equal(lines[1].text, "1. Purpose");
assert.equal(lines[5].text, "Zone");
assert.equal(lines[6].text, "4.2.1 Fees are R1 200 & <due>.", "control character dropped, numbering kept");

(async () => {
  const docx = await transcriptToDocx(sample);
  const xml = await (await JSZip.loadAsync(docx)).file("word/document.xml")!.async("text");
  assert.ok(xml.includes("Admissions Policy"));
  assert.ok(xml.includes("&amp; &lt;due&gt;"), "escaped, so Word opens it");
  console.log("policy-to-word: all checks passed");
})();
