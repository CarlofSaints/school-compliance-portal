"use client";

import { cellText, tableLines } from "./minutesBody";

/**
 * Text for what was pasted, when the clipboard carries a TABLE (Word, Excel, a
 * web page). Null when it has none, so an ordinary paste is left to the browser.
 *
 * Word puts the real structure on the clipboard as HTML; the plain-text copy
 * is what used to arrive, tabs and all, and "looks messy". Paragraphs around
 * the table keep their order.
 */
export function tableAwarePaste(html: string): string | null {
  if (!html || !/<table/i.test(html)) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const parts: string[] = [];
  let line = "";
  const flush = () => {
    const text = line.replace(/\s+/g, " ").trim();
    if (text) parts.push(text);
    line = "";
  };
  const BLOCK = /^(P|DIV|LI|UL|OL|H[1-6]|BLOCKQUOTE|SECTION|ARTICLE|PRE|TR)$/;
  // Walks the pasted page once, in order: every piece of text lands exactly
  // once, block elements break lines, and an outermost table becomes rows.
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      line += node.textContent || "";
      return;
    }
    if (!(node instanceof Element)) return;
    if (/^(STYLE|SCRIPT|HEAD|META|TITLE)$/.test(node.tagName)) return;
    if (node.tagName === "TABLE") {
      flush();
      const rows = Array.from((node as HTMLTableElement).rows)
        // Cells of THIS table only, not of a table nested inside one.
        .filter((tr) => tr.closest("table") === node)
        .map((tr) => Array.from(tr.cells).map((td) => cellText(td.textContent || "")))
        .filter((r) => r.some((c) => c));
      if (rows.length) parts.push(tableLines(rows));
      return;
    }
    if (node.tagName === "BR") return flush();
    const block = BLOCK.test(node.tagName);
    if (block) flush();
    node.childNodes.forEach(walk);
    if (block) flush();
  };
  walk(doc.body);
  flush();
  return parts.length ? parts.join("\n") : null;
}

/** The natural size of a picture, for laying it out in the Word file. */
export async function imageSize(file: Blob): Promise<{ width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const size = { width: bmp.width, height: bmp.height };
  bmp.close();
  return size;
}
