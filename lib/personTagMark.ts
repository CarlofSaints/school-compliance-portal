"use client";

import { Mark, mergeAttributes } from "@tiptap/core";

// Selected text tagged with a person: "Mr Lester remarked..." tagged with the
// person who reported it. Carl: "tag ... any selection of text within a section".
// Drawn as a dotted underline with the name on hover; the name is FROZEN in
// the mark, like every other name in the minutes.
export const PersonTag = Mark.create({
  name: "personTag",
  inclusive: false,
  addAttributes() {
    return {
      id: { default: null, parseHTML: (el) => el.getAttribute("data-person-id"), renderHTML: (a) => ({ "data-person-id": a.id }) },
      name: { default: null, parseHTML: (el) => el.getAttribute("data-person-name"), renderHTML: (a) => ({ "data-person-name": a.name, title: a.name }) },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-person-id]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "person-tag" }), 0];
  },
});
