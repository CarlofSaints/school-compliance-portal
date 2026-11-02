// Formatted minutes sections (bold, colour, fonts, highlight, lists, tables, pictures).
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-minutes-rich-text.ts
import assert from "node:assert/strict";
import JSZip from "jszip";
import { cleanDoc, docToText, textToDoc, stableDoc, cleanColor, cleanFont, cleanFontSize, imageSrc, type RichNode } from "../lib/richDoc";
import { canonicalMinutes, type MinutesSection } from "../lib/minutes";
import { sameText } from "../lib/minutesAutosave";
import { saveMinutesImage } from "../lib/minutesImages";
import { createMinutes, updateMinutes, getMinutes } from "../lib/minutesData";
import { buildMinutesDocxFile } from "../lib/minutesDocxFile";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const MID = "m-1";
const SHA = "b".repeat(64);
const text = (t: string, marks?: RichNode["marks"]): RichNode => (marks ? { type: "text", text: t, marks } : { type: "text", text: t });
const p = (...c: RichNode[]): RichNode => ({ type: "paragraph", content: c });

async function main() {
  // Values: only safe shapes survive.
  assert.equal(cleanColor("rgb(255, 0, 0)"), "#ff0000");
  assert.equal(cleanColor("#ABC"), "#aabbcc");
  assert.equal(cleanColor("red; background:url(x)"), undefined);
  assert.equal(cleanFont("'Calibri', sans-serif"), "Calibri");
  assert.equal(cleanFont("x;}</style><script>"), undefined);
  assert.equal(cleanFontSize("16px"), "12pt");
  assert.equal(cleanFontSize("999pt"), undefined);

  // A document as a browser might send it, with things that must not survive.
  const sent = {
    type: "doc",
    content: [
      p(text("Approved ", [{ type: "bold" }]), text("R12 000", [{ type: "textStyle", attrs: { color: "rgb(220, 38, 38)", fontFamily: "Georgia", fontSize: "14pt" } }, { type: "highlight", attrs: { color: "#fff59d" } }])),
      { type: "script", content: [text("alert(1)")] },
      p(text("x", [{ type: "link", attrs: { href: "javascript:alert(1)" } } as never])),
      { type: "image", attrs: { src: "https://evil.example/x.png" } },
      { type: "image", attrs: { src: imageSrc("other-minutes", SHA) } },
      { type: "image", attrs: { src: imageSrc(MID, SHA), width: 400, height: 300 } },
      { type: "bulletList", content: [{ type: "listItem", content: [p(text("First"))] }, { type: "listItem", content: [p(text("Second"))] }] },
      { type: "table", content: [{ type: "tableRow", content: [{ type: "tableHeader", attrs: { colspan: 1, rowspan: 1 }, content: [p(text("Item"))] }, { type: "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: [p(text("A|B"))] }] }] },
    ],
  };
  const doc = cleanDoc(sent, MID)!;
  const json = JSON.stringify(doc);
  assert.ok(!json.includes("alert"), "script and link dropped");
  assert.ok(!json.includes("evil") && !json.includes("other-minutes"), "pictures only from these minutes");
  assert.ok(json.includes("#dc2626") && json.includes("Georgia") && json.includes("14pt"));
  assert.equal(stableDoc(cleanDoc(doc, MID)!), stableDoc(doc), "cleaning twice changes nothing (page and server agree)");

  // Plain text for every older reader.
  const body = docToText(doc);
  assert.equal(body, ["Approved R12 000", "x", `[image:${SHA}:400x300]`, "- First", "- Second", "| Item | A/B |"].join("\n"));

  // Paragraphs inside a table cell stay apart in the plain text.
  const cell2 = cleanDoc({ type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", attrs: {}, content: [p(text("Approved")), p(text("R12 000"))] }] }] }] }, MID)!;
  assert.equal(docToText(cell2), "| Approved R12 000 |");

  // Over the size limit the WHOLE document is refused, never saved cut short.
  assert.equal(cleanDoc({ type: "doc", content: [p(text("x".repeat(200_001)))] }, MID), null);
  assert.equal(cleanDoc({ type: "doc", content: Array.from({ length: 20_001 }, () => p()) }, MID), null);

  // An older plain section opens with its table as a table and comes back the same.
  const old = `Notes\n| a | b |\n| c | d |\n[image:${SHA}:10x20]`;
  assert.equal(docToText(cleanDoc(textToDoc(old, MID), MID)), old);

  // The signing hash: unchanged for a section with no doc; formatting counts.
  const sec = (extra: Partial<MinutesSection> = {}): MinutesSection => ({ id: "s", title: "Finance", body: "Approved R12 000", order: 1, ...extra });
  const meta = { title: "M", body: "sgb", period: { kind: "month" as const, year: 2026, month: 11 } };
  const plain = canonicalMinutes({ ...meta, sections: [sec()] });
  assert.ok(!plain.includes("{"), "no doc, nothing added to the hash");
  const bold = cleanDoc({ type: "doc", content: [p(text("Approved R12 000", [{ type: "bold" }]))] }, MID)!;
  const red = cleanDoc({ type: "doc", content: [p(text("Approved R12 000", [{ type: "textStyle", attrs: { color: "#ff0000" } }]))] }, MID)!;
  assert.notEqual(canonicalMinutes({ ...meta, sections: [sec({ doc: bold })] }), canonicalMinutes({ ...meta, sections: [sec({ doc: red })] }), "bold vs red hashes differently");

  // Autosave sees a formatting-only change as unsaved.
  const t = { title: "M", body: "", period: meta.period, sections: [sec({ doc: bold })] };
  assert.equal(sameText(t, { ...t, sections: [sec({ doc: red })] }), false);
  assert.equal(sameText(t, { ...t, sections: [sec({ doc: cleanDoc(bold, MID)! })] }), true);

  // The Word file carries the formatting.
  const m = await createMinutes({ title: "Rich", body: "sgb", period: meta.period, sections: [] } as unknown as Parameters<typeof createMinutes>[0]);
  const imgId = await saveMinutesImage(m.id, PNG);
  // The picture sits INSIDE a table cell: it must still reach the Word file.
  const wordDoc = cleanDoc({ ...sent, content: [...sent.content, { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", attrs: {}, content: [{ type: "image", attrs: { src: imageSrc(m.id, imgId) } }] }] }] }] }, m.id)!;
  await updateMinutes(m.id, { sections: [{ id: "s1", title: "Finance", order: 1, body: docToText(wordDoc), doc: wordDoc }] });
  const xml = await (await JSZip.loadAsync(await buildMinutesDocxFile((await getMinutes(m.id))!))).file("word/document.xml")!.async("string");
  assert.ok(/<w:b\/>/.test(xml), "bold");
  assert.ok(xml.includes('w:val="dc2626"'), "colour");
  assert.ok(/w:fill="fff59d"/.test(xml), "highlight");
  assert.ok(xml.includes("Georgia"), "font");
  assert.ok(xml.includes('w:val="28"'), "14pt = 28 half-points");
  assert.ok(xml.includes("•") && xml.includes("Second"), "bullets");
  assert.ok((xml.match(/<w:tbl>/g) || []).length >= 2, "table nested in the section");
  assert.ok(xml.includes("<w:drawing>"), "picture in a table cell embedded");
  assert.ok(!xml.includes("picture unavailable"), "no missing picture");
  assert.ok(!/<\/w:tbl><\/w:tc>/.test(xml), "no cell ends on a table");

  console.log("check-minutes-rich-text: all passed");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
