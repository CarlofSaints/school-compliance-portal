// Tables and pictures in minutes sections.
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-minutes-tables-images.ts
import assert from "node:assert/strict";
import JSZip from "jszip";
import { bodyBlocks, imageIds, imageLine, tableLines } from "../lib/minutesBody";
import { imageKind, saveMinutesImage } from "../lib/minutesImages";
import { createMinutes, updateMinutes, getMinutes } from "../lib/minutesData";
import { buildMinutesDocxFile } from "../lib/minutesDocxFile";

// A 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function main() {
  // Plain text is untouched: one text block, same lines.
  assert.deepEqual(bodyBlocks("Line one\nLine two"), [{ kind: "text", lines: ["Line one", "Line two"] }]);

  // A table between two paragraphs; divider rows dropped; short rows padded.
  const table = tableLines([["Item", "Cost"], ["Paint", "R 1|200"], ["Hall"]]);
  assert.match(table, /R 1\/200/, "a pipe inside a cell must not split it");
  const blocks = bodyBlocks(`Before\n${table}\n|---|---|\nAfter`);
  assert.deepEqual(blocks.map((b) => b.kind), ["text", "table", "text"]);
  assert.deepEqual((blocks[1] as { rows: string[][] }).rows, [["Item", "Cost"], ["Paint", "R 1/200"], ["Hall", ""]]);

  // Pictures: only a real 64-hex id is a picture; anything else stays text.
  const id = "a".repeat(64);
  assert.deepEqual(bodyBlocks(imageLine(id, 800, 600)), [{ kind: "image", id, width: 800, height: 600 }]);
  assert.equal(bodyBlocks("[image:../../etc:1x1]")[0].kind, "text");
  assert.deepEqual(imageIds(`x\n${imageLine(id, 1, 1)}`), [id]);

  // Only PNG / JPEG by their bytes.
  assert.equal(imageKind(PNG), "png");
  assert.equal(imageKind(Buffer.from("<svg>")), null);

  // The Word file: a real nested table, the picture embedded, and still a file Word opens.
  const m = await createMinutes({
    title: "Check",
    body: "sgb",
    period: { kind: "month", year: 2026, month: 11 },
    sections: [],
  } as unknown as Parameters<typeof createMinutes>[0]);
  const imgId = await saveMinutesImage(m.id, PNG);
  await updateMinutes(m.id, {
    sections: [{ id: "s1", title: "Finance", order: 1, body: `Quotes:\n${table}\n${imageLine(imgId, 1, 1)}` }],
  });
  const docx = await buildMinutesDocxFile((await getMinutes(m.id))!);
  const zip = await JSZip.loadAsync(docx);
  const xml = await zip.file("word/document.xml")!.async("string");
  assert.ok((xml.match(/<w:tbl>/g) || []).length >= 2, "the section table holds a nested table");
  assert.ok(xml.includes("Paint") && xml.includes("R 1/200"));
  assert.ok(Object.keys(zip.files).some((n) => n.startsWith("word/media/")), "picture embedded");
  // Every table cell ends with a paragraph (Word reports anything else as corrupt).
  assert.ok(!/<\/w:tbl><\/w:tc>/.test(xml), "a cell ends on a table");

  console.log("check-minutes-tables-images: all passed");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
