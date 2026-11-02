"use client";

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

// Carl: "If a name is added to the People register etc., then that word should
// not be marked as spelled incorrectly."
//
// A page cannot add words to the browser's dictionary, but it can switch the
// spell checker off for chosen words: each name on the register is wrapped in
// spellcheck="false" as you type, so "Khumalo" gets no red line. Only the
// display is touched; nothing is added to the stored minutes.

export const nameSpellcheckKey = new PluginKey<DecorationSet>("nameSpellcheck");

/** The separate words of the register's names ("Nomsa", "Khumalo"). */
export function nameWords(names: string[]): Set<string> {
  const out = new Set<string>();
  for (const n of names) for (const w of n.match(/[\p{L}'’-]+/gu) ?? []) if (w.length >= 2) out.add(w.toLowerCase());
  return out;
}

function build(doc: PMNode, words: Set<string>): DecorationSet {
  if (!words.size) return DecorationSet.empty;
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    for (const m of node.text.matchAll(/[\p{L}'’-]+/gu)) {
      if (words.has(m[0].toLowerCase())) {
        decos.push(Decoration.inline(pos + m.index!, pos + m.index! + m[0].length, { spellcheck: "false" }));
      }
    }
  });
  return DecorationSet.create(doc, decos);
}

/** \`getWords\` is read on every rebuild, so the list can arrive after the editor. */
export const NameSpellcheck = (getWords: () => Set<string>) =>
  Extension.create({
    name: "nameSpellcheck",
    addProseMirrorPlugins() {
      return [
        new Plugin<DecorationSet>({
          key: nameSpellcheckKey,
          state: {
            init: (_, { doc }) => build(doc, getWords()),
            // Rebuilt when the text changes or the name list arrives (meta).
            apply: (tr, old) => (tr.docChanged || tr.getMeta(nameSpellcheckKey) ? build(tr.doc, getWords()) : old),
          },
          props: {
            decorations: (state) => nameSpellcheckKey.getState(state),
          },
        }),
      ];
    },
  });
