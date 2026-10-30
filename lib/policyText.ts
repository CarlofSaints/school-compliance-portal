import { docxText } from "./branding";

// No server imports: the "Compile a policy" preview uses the same parser as the Word file, so both show the same text.

export type Line = { kind: "h1" | "h2" | "bullet" | "para"; text: string };

/** The transcript as Word paragraphs. Pure, so scripts/check-policy-to-word.ts can test it. */
export function parseTranscript(text: string): Line[] {
  const out: Line[] = [];
  for (const block of docxText(text).replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    for (const raw of block.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("## ")) out.push({ kind: "h2", text: line.slice(3).trim() });
      else if (line.startsWith("# ")) out.push({ kind: "h1", text: line.slice(2).trim() });
      else if (/^[-•*] /.test(line)) out.push({ kind: "bullet", text: line.slice(2).trim() });
      else out.push({ kind: "para", text: line });
    }
  }
  return out;
}
