import Anthropic from "@anthropic-ai/sdk";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { docxText } from "./branding";

// ---------------------------------------------------------------------------
// A scanned (flat) PDF policy turned into an editable Word document, for a
// school that only has its policies on paper. Claude reads the PDF natively,
// page images included, so a scan with no text layer reads the same as a
// digital PDF; no OCR library on the server (the pdfjs/canvas path crashed
// the function before, see CLAUDE.md).
//
// The transcript comes back in the same plain convention the translations
// use: "# " heading, "## " sub-heading, "- " bullet. Numbered clauses keep
// their own numbers as typed text, so 4.2.1 stays 4.2.1.
// ---------------------------------------------------------------------------

const MODEL = "claude-opus-5-5";

export class TranscribeError extends Error {}

export async function transcribePdf(pdf: Buffer, title: string, deadline: number): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const client = new Anthropic({ apiKey, maxRetries: 2 });
  // Streamed: a long policy takes minutes to write out in full.
  const message = await client.messages
    .stream(
      {
        model: MODEL,
        max_tokens: 64000,
        output_config: { effort: "low" },
        system:
          "You transcribe scanned South African school governance documents into clean text. Copy every word of the document " +
          "faithfully, in order, keeping clause numbering, amounts, dates, names and legal references exactly as printed. Do not " +
          "summarise, correct or add anything. Leave out page numbers, running headers/footers repeated on every page, and scanner " +
          "marks. Join lines that a page break or line wrap split mid-sentence. Output only the text: '# ' for the document title " +
          "and main headings, '## ' for sub-headings, '- ' for bullet points, a blank line between paragraphs. Write [illegible] " +
          "where a word cannot be read. No preamble, no notes.",
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
              { type: "text", text: `Transcribe the policy "${title}" above.` },
            ],
          },
        ],
      },
      // Stopped by us before the route's limit so the person gets a message, not a dead request.
      { signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) }
    )
    .finalMessage();

  if (message.stop_reason === "refusal") throw new TranscribeError("This document could not be read automatically.");
  if (message.stop_reason === "max_tokens") throw new TranscribeError("This document is too long to convert in one go. Split it into parts.");
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new TranscribeError("No text could be read from this document.");
  return text;
}

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

export async function transcriptToDocx(text: string): Promise<Buffer> {
  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    sections: [
      {
        children: parseTranscript(text).map((l) =>
          l.kind === "h1"
            ? new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(l.text)] })
            : l.kind === "h2"
              ? new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(l.text)] })
              : l.kind === "bullet"
                ? new Paragraph({ bullet: { level: 0 }, children: [new TextRun(l.text)] })
                : new Paragraph({ spacing: { after: 120 }, children: [new TextRun(l.text)] })
        ),
      },
    ],
  });
  return Packer.toBuffer(doc);
}
