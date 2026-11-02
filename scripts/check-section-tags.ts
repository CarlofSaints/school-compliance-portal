// People tagged on minutes sections (and on text): initials in the Responsible column.
//   npx tsx scripts/check-section-tags.ts
import assert from "node:assert/strict";
import { cleanTags, initials, responsibleText, canonicalMinutes, type MinutesSection } from "../lib/minutes";
import { cleanDoc } from "../lib/richDoc";

assert.equal(initials("Graham Cuerden"), "GC");
assert.equal(initials("Pieter van Wyk"), "PvW");
assert.equal(initials("D'Arcy O'Neill-Smith"), "DO");

assert.deepEqual(cleanTags([{ id: "a", name: " Nomsa  Khumalo " }, { id: "a", name: "dup" }, { id: "", name: "x" }, { id: "b" }]), [{ id: "a", name: "Nomsa Khumalo" }]);
assert.equal(cleanTags([]), undefined);

const doc = cleanDoc({ type: "doc", content: [{ type: "paragraph", content: [
  { type: "text", text: "Mr Lester remarked", marks: [{ type: "personTag", attrs: { id: "g", name: "Graham Cuerden" } }] },
  { type: "text", text: " on the hall.", marks: [{ type: "personTag", attrs: { id: "", name: "nobody" } }] },
] }] }, "m")!;
assert.equal(JSON.stringify(doc).includes("nobody"), false, "a tag without an id is dropped");

// Two people with the same initials both print.
assert.equal(responsibleText({ tags: [{ id: "a", name: "Nomsa Khumalo" }, { id: "b", name: "Nandi Khoza" }] }), "NK, NK");

// Section tags + text tags, typed text first, each person once.
assert.equal(responsibleText({ tags: [{ id: "a", name: "Nomsa Khumalo" }, { id: "g", name: "Graham Cuerden" }], doc }), "NK, GC");
assert.equal(responsibleText({ responsible: "Finance committee", tags: [{ id: "a", name: "Nomsa Khumalo" }] }), "Finance committee, NK");
assert.equal(responsibleText({ responsible: "Kevin" }), "Kevin");

// Hash: unchanged without tags; a tag counts.
const s = (extra: Partial<MinutesSection> = {}): MinutesSection => ({ id: "s", title: "T", body: "b", order: 1, ...extra });
const meta = { title: "M", body: "sgb", period: { kind: "month" as const, year: 2026, month: 11 } };
const plain = canonicalMinutes({ ...meta, sections: [s()] });
assert.equal(canonicalMinutes({ ...meta, sections: [s({ tags: undefined })] }), plain);
assert.notEqual(canonicalMinutes({ ...meta, sections: [s({ tags: [{ id: "a", name: "Nomsa" }] })] }), plain);
console.log("check-section-tags: all passed");
