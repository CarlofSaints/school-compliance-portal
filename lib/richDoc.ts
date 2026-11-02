import { bodyBlocks, cellText, imageLine } from "./minutesBody";

// ---------------------------------------------------------------------------
// FORMATTED minutes sections (bold, italics, underline, colour, highlight,
// fonts, sizes, lists, tables, pictures). PURE, client and server.
//
// Carl: "allow for bold, italics, underlining, coloured font, changing font
// types, highlighting text etc. basically, anything a word doc can do".
//
// The editor (TipTap) produces a ProseMirror JSON document. It is stored on
// the section as `doc`, NEXT TO the plain-text `body`, never instead of it:
//   - `body` is DERIVED from `doc` on the server (docToText), so Ask Jono,
//     translation, "+ Add to action items", copy-text and every older reader
//     keep reading plain text exactly as before;
//   - a section with no `doc` (every set written before this) shows and
//     prints exactly as it always did.
// 🔴 `doc` comes from a browser, so the server rebuilds it through cleanDoc:
// only known node and mark types, colours and fonts in safe shapes, pictures
// only from these minutes' own picture store. Nothing is ever rendered as raw
// HTML; screens walk the JSON with React, Word walks it with docx.
// ---------------------------------------------------------------------------

export interface RichMark {
  type: "bold" | "italic" | "underline" | "strike" | "textStyle" | "highlight" | "personTag";
  attrs?: { color?: string; fontFamily?: string; fontSize?: string; id?: string; name?: string };
}

export interface RichNode {
  type: string;
  attrs?: Record<string, string | number | null>;
  content?: RichNode[];
  text?: string;
  marks?: RichMark[];
}

const BLOCKS = new Set(["paragraph", "heading", "bulletList", "orderedList", "listItem", "table", "tableRow", "tableCell", "tableHeader"]);
const LIMIT_NODES = 20_000;
const LIMIT_TEXT = 200_000;

/** Fonts offered in the editor. A pasted font outside the list is kept only if
 *  it is a plain font name. */
export const FONTS = ["Arial", "Calibri", "Cambria", "Georgia", "Times New Roman", "Verdana", "Tahoma", "Courier New"];
export const FONT_SIZES = ["8pt", "9pt", "10pt", "11pt", "12pt", "14pt", "16pt", "18pt", "24pt"];

/** #rgb / #rrggbb / rgb(r, g, b) -> #rrggbb, anything else -> undefined. */
export function cleanColor(v: unknown): string | undefined {
  const s = String(v ?? "").trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return "#" + m[1].split("").map((c) => c + c).join("");
  m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) return "#" + m[1];
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/.exec(s);
  if (rgb) {
    const hex = rgb.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0"));
    return "#" + hex.join("");
  }
  return undefined;
}

export function cleanFont(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  // First family of a list such as "Calibri, sans-serif", quotes dropped.
  const first = s.split(",")[0].replace(/["']/g, "").trim();
  return /^[A-Za-z0-9 -]{1,40}$/.test(first) ? first : undefined;
}

export function cleanFontSize(v: unknown): string | undefined {
  const m = /^(\d{1,2}(?:\.\d)?)(pt|px)$/.exec(String(v ?? "").trim());
  if (!m) return undefined;
  const pt = m[2] === "px" ? Number(m[1]) * 0.75 : Number(m[1]);
  return pt >= 6 && pt <= 72 ? `${Math.round(pt * 2) / 2}pt` : undefined;
}

export const imageSrc = (minutesId: string, imageId: string) =>
  `/api/minutes/${encodeURIComponent(minutesId)}/images/${imageId}`;

/** The picture id at the end of an image address. */
export const imageIdOf = (src: unknown): string | undefined => /([0-9a-f]{64})$/.exec(String(src ?? ""))?.[1];

function imageIdFromSrc(minutesId: string, src: unknown): string | null {
  const m = /^\/api\/minutes\/([^/]+)\/images\/([0-9a-f]{64})$/.exec(String(src ?? ""));
  return m && decodeURIComponent(m[1]) === minutesId ? m[2] : null;
}

const int = (v: unknown, lo: number, hi: number): number | undefined => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined;
};

function cleanMarks(raw: unknown): RichMark[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: RichMark[] = [];
  for (const m of raw) {
    const type = (m as RichMark)?.type;
    const a = (m as RichMark)?.attrs ?? {};
    if (type === "bold" || type === "italic" || type === "underline" || type === "strike") out.push({ type });
    else if (type === "textStyle") {
      const attrs = { color: cleanColor(a.color), fontFamily: cleanFont(a.fontFamily), fontSize: cleanFontSize(a.fontSize) };
      const kept = Object.fromEntries(Object.entries(attrs).filter(([, v]) => v)) as RichMark["attrs"];
      if (kept && Object.keys(kept).length) out.push({ type, attrs: kept });
    } else if (type === "personTag") {
      const id = String(a.id ?? "").trim().slice(0, 64);
      const name = String(a.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      if (id && name) out.push({ type, attrs: { id, name } });
    } else if (type === "highlight") {
      out.push({ type, attrs: { color: cleanColor(a.color) ?? "#fff59d" } });
    }
  }
  return out.length ? out : undefined;
}

/**
 * The document as it may be stored: rebuilt node by node from what arrived.
 * Null when there is nothing usable (the section then stays plain text).
 */
export function cleanDoc(raw: unknown, minutesId: string): RichNode | null {
  let nodes = 0;
  let textLen = 0;
  // 🔴 Over a limit, the WHOLE document is refused rather than saved cut short.
  let tooBig = false;
  const walk = (n: unknown, depth: number): RichNode | null => {
    if (!n || typeof n !== "object") return null;
    if (depth > 25 || ++nodes > LIMIT_NODES) {
      tooBig = true;
      return null;
    }
    const node = n as RichNode;
    const kids = () =>
      Array.isArray(node.content) ? node.content.map((c) => walk(c, depth + 1)).filter((c): c is RichNode => !!c) : [];
    switch (node.type) {
      case "text": {
        const text = String(node.text ?? "");
        if (!text) return null;
        if ((textLen += text.length) > LIMIT_TEXT) {
          tooBig = true;
          return null;
        }
        const marks = cleanMarks(node.marks);
        return marks ? { type: "text", text, marks } : { type: "text", text };
      }
      case "hardBreak":
        return { type: "hardBreak" };
      case "image": {
        const id = imageIdFromSrc(minutesId, node.attrs?.src);
        if (!id) return null;
        return {
          type: "image",
          attrs: { src: imageSrc(minutesId, id), width: int(node.attrs?.width, 1, 20000) ?? null, height: int(node.attrs?.height, 1, 20000) ?? null },
        };
      }
      case "heading":
        return { type: "heading", attrs: { level: int(node.attrs?.level, 1, 3) ?? 2 }, content: kids() };
      case "orderedList":
        return { type: "orderedList", attrs: { start: int(node.attrs?.start, 1, 9999) ?? 1 }, content: kids() };
      case "tableCell":
      case "tableHeader":
        return {
          type: node.type,
          attrs: { colspan: int(node.attrs?.colspan, 1, 50) ?? 1, rowspan: int(node.attrs?.rowspan, 1, 200) ?? 1 },
          content: kids(),
        };
      default:
        if (node.type === "doc" || BLOCKS.has(node.type)) return { type: node.type, content: kids() };
        return null; // unknown node: dropped, its text with it
    }
  };
  const doc = walk(raw, 0);
  if (!doc || doc.type !== "doc" || tooBig) return null;
  return doc;
}

const textOf = (n: RichNode): string =>
  n.type === "text"
    ? n.text ?? ""
    : n.type === "hardBreak"
      ? "\n"
      : (n.content ?? []).map(textOf).join((n.content ?? []).some((c) => BLOCKS.has(c.type)) ? "\n" : "");

/**
 * The plain text of a document, in the format every older reader understands
 * (lib/minutesBody): paragraphs as lines, tables as "| a | b |" rows, pictures
 * as "[image:...]" lines, list items with "- " or "1. ".
 */
export function docToText(doc: RichNode | null | undefined): string {
  if (!doc) return "";
  const lines: string[] = [];
  const block = (n: RichNode, prefix = "") => {
    switch (n.type) {
      case "paragraph":
      case "heading":
        lines.push(prefix + textOf(n));
        return;
      case "bulletList":
      case "orderedList": {
        let i = Number(n.attrs?.start ?? 1);
        for (const item of n.content ?? []) {
          const mark = n.type === "bulletList" ? "- " : `${i++}. `;
          (item.content ?? []).forEach((c, j) => block(c, j === 0 ? prefix + mark : prefix + "   "));
        }
        return;
      }
      case "table":
        for (const row of n.content ?? []) lines.push(`| ${(row.content ?? []).map((c) => cellText(textOf(c))).join(" | ")} |`);
        return;
      case "image": {
        const id = imageIdOf(n.attrs?.src);
        if (id) lines.push(imageLine(id, Number(n.attrs?.width) || 800, Number(n.attrs?.height) || 600));
        return;
      }
      default:
        (n.content ?? []).forEach((c) => block(c, prefix));
    }
  };
  (doc.content ?? []).forEach((n) => block(n));
  return lines.join("\n");
}

/** An older plain-text section as an editor document, so it opens formatted
 *  (its tables as tables, its pictures as pictures). */
export function textToDoc(body: string, minutesId: string): RichNode {
  const content: RichNode[] = [];
  const para = (t: string): RichNode => (t ? { type: "paragraph", content: [{ type: "text", text: t }] } : { type: "paragraph" });
  for (const b of bodyBlocks(body || "")) {
    if (b.kind === "text") b.lines.forEach((l) => content.push(para(l)));
    else if (b.kind === "table")
      content.push({
        type: "table",
        content: b.rows.map((r, ri) => ({
          type: "tableRow",
          content: r.map((c) => ({ type: ri === 0 ? "tableHeader" : "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: [para(c)] })),
        })),
      });
    else content.push({ type: "image", attrs: { src: imageSrc(minutesId, b.id), width: b.width, height: b.height } });
  }
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/** Key order fixed, so the same document always hashes the same. */
export function stableDoc(doc: RichNode): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]))
        : v;
  return JSON.stringify(sort(doc));
}

/** The people tagged on text in a document, in order, once each. */
export function docTags(doc: RichNode | null | undefined): { id: string; name: string }[] {
  const out = new Map<string, string>();
  const walk = (n: RichNode) => {
    for (const m of n.marks ?? []) if (m.type === "personTag" && m.attrs?.id && m.attrs.name && !out.has(m.attrs.id)) out.set(m.attrs.id, m.attrs.name);
    (n.content ?? []).forEach(walk);
  };
  if (doc) walk(doc);
  return [...out].map(([id, name]) => ({ id, name }));
}

/** Picture ids a document uses. */
export function docImageIds(doc: RichNode | null | undefined): string[] {
  const out: string[] = [];
  const walk = (n: RichNode) => {
    if (n.type === "image") {
      const id = imageIdOf(n.attrs?.src);
      if (id) out.push(id);
    }
    (n.content ?? []).forEach(walk);
  };
  if (doc) walk(doc);
  return out;
}

