// ---------------------------------------------------------------------------
// Tables and pictures inside a minutes section. PURE (client and server).
//
// Carl: "we need to allow for screenshots and tables. when i am adding in a
// table from Word it scrambled it and pasted it as text."
//
// 🔴 A section body stays PLAIN TEXT. Every existing set of minutes, the
// signing hash, autosave, Ask Jono and the Word file all read it as text, so
// nothing already written changes. A table is lines of "| a | b |"; a picture
// is one line "[image:<sha256>:<w>x<h>]". The picture is named by the SHA-256
// of its bytes, so the signing hash (which covers the body) also covers the
// picture: swapping the file changes its name and breaks the signature.
// ---------------------------------------------------------------------------

export type BodyBlock =
  | { kind: "text"; lines: string[] }
  | { kind: "table"; rows: string[][] }
  | { kind: "image"; id: string; width: number; height: number };

const IMAGE_LINE = /^\[image:([0-9a-f]{64}):(\d{1,5})x(\d{1,5})\]$/;
const isTableLine = (l: string) => /^\|.*\|$/.test(l.trim());
// A markdown-style "|---|---|" divider carries no data.
const isDivider = (l: string) => /^\|[\s:|-]+\|$/.test(l.trim()) && l.includes("-");

export function imageLine(id: string, width: number, height: number): string {
  return `[image:${id}:${Math.round(width)}x${Math.round(height)}]`;
}

export function splitCells(line: string): string[] {
  return line.trim().slice(1, -1).split("|").map((c) => c.trim());
}

export function bodyBlocks(body: string): BodyBlock[] {
  const out: BodyBlock[] = [];
  for (const line of (body || "").split(/\r?\n/)) {
    const img = IMAGE_LINE.exec(line.trim());
    const last = out[out.length - 1];
    if (img) {
      out.push({ kind: "image", id: img[1], width: Number(img[2]) || 1, height: Number(img[3]) || 1 });
    } else if (isTableLine(line)) {
      if (isDivider(line)) continue;
      if (last?.kind === "table") last.rows.push(splitCells(line));
      else out.push({ kind: "table", rows: [splitCells(line)] });
    } else if (last?.kind === "text") {
      last.lines.push(line);
    } else {
      out.push({ kind: "text", lines: [line] });
    }
  }
  // Rows of a table padded to the same width, so a short row cannot shift columns.
  for (const b of out) {
    if (b.kind !== "table") continue;
    const n = Math.max(...b.rows.map((r) => r.length));
    b.rows = b.rows.map((r) => [...r, ...Array(n - r.length).fill("")]);
  }
  return out;
}

/** The pictures a body uses, so the Word file and a delete know what to fetch. */
export function imageIds(body: string): string[] {
  return bodyBlocks(body).flatMap((b) => (b.kind === "image" ? [b.id] : []));
}

/** One table cell as text: no pipes (they would split the cell), no line breaks. */
export function cellText(raw: string): string {
  return raw.replace(/\s+/g, " ").replace(/\|/g, "/").trim();
}

/** Rows as "| a | b |" lines. */
export function tableLines(rows: string[][]): string {
  return rows.map((r) => `| ${r.map(cellText).join(" | ")} |`).join("\n");
}
