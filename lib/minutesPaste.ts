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
  const blocks = doc.body.querySelectorAll("table, p, li, h1, h2, h3, h4, h5, h6");
  for (const el of Array.from(blocks)) {
    // A paragraph INSIDE a table cell is part of that cell, not its own line.
    if (el.tagName !== "TABLE" && el.closest("table")) continue;
    // A table inside a table: its outer one already carries the text.
    if (el.tagName === "TABLE" && el.parentElement?.closest("table")) continue;
    if (el.tagName === "TABLE") {
      const rows = Array.from((el as HTMLTableElement).rows)
        .map((tr) => Array.from(tr.cells).map((td) => cellText(td.textContent || "")))
        .filter((r) => r.some((c) => c));
      if (rows.length) parts.push(tableLines(rows));
    } else {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (text) parts.push(text);
    }
  }
  return parts.length ? parts.join("\n") : null;
}

/** The natural size of a picture, for laying it out in the Word file. */
export async function imageSize(file: Blob): Promise<{ width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const size = { width: bmp.width, height: bmp.height };
  bmp.close();
  return size;
}
