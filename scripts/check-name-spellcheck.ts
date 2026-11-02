// Register names are never marked as misspelt in the minutes editor.
//   npx tsx scripts/check-name-spellcheck.ts
import assert from "node:assert/strict";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { EditorState } from "@tiptap/pm/state";
import { NameSpellcheck, nameSpellcheckKey, nameWords } from "../lib/nameSpellcheck";

const words = nameWords(["Nomsa Khumalo", "Pieter van Wyk", "D'Arcy O'Neill-Smith", "J"]);
assert.ok(words.has("khumalo") && words.has("wyk") && words.has("d'arcy") && words.has("o'neill-smith"));
assert.ok(!words.has("j"), "one letter is not a name");

const ext = NameSpellcheck(() => words);
const schema = getSchema([StarterKit, ext]);
const doc = schema.nodeFromJSON({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Khumalo and khumalo met Mr Van Wyk about the hall." }] }] });
const plugin = ext.config.addProseMirrorPlugins!.call({} as never)[0];
const state = EditorState.create({ doc, plugins: [plugin] });
const found = nameSpellcheckKey.getState(state)!.find().map((d) => state.doc.textBetween(d.from, d.to));
assert.deepEqual(found, ["Khumalo", "khumalo", "Van", "Wyk"], "names marked, any case; ordinary words not");
console.log("check-name-spellcheck: all passed");
