import Anthropic from "@anthropic-ai/sdk";
import { AlignmentType, Document, Footer, HeadingLevel, ImageRun, Packer, PageNumber, Paragraph, TextRun } from "docx";
import { MAX_WORD_FOOTER_LINES, cleanWordFooter, docxText, type SchoolBranding } from "./branding";
import { crestImage } from "./minutesDocx";
import { parseTranscript } from "./policyToWord";
import { sourceBlocks } from "./trainingAi";
import { PROVINCES } from "./trainingTopics";
import { COMPLY_WITH, MAX_DESCRIPTION, MAX_NAME } from "./policyCompileOptions";

export { COMPLY_WITH, MAX_DESCRIPTION, MAX_DRAFT, MAX_INSTRUCTION, MAX_NAME } from "./policyCompileOptions";

// ---------------------------------------------------------------------------
// A policy the school does not have yet, drafted from scratch: the school says
// what it needs and which law and guidance it must follow, Claude writes it,
// a person reads it, asks for changes or runs the compliance check, and only
// then adds it to the register as a Word file on the school's letterhead.
//
// The draft is plain text in the convention the scanned-PDF transcripts use
// ("# " heading, "## " sub-heading, "- " bullet), so one parser
// (parseTranscript) turns both into Word.
// ---------------------------------------------------------------------------

const MODEL = "claude-opus-5-5";

export interface CompileRequest {
  name: string;
  description: string;
  comply: string[];
  province: string;
  guidelineIds: string[];
}

export class CompileError extends Error {}

/** The request as typed, checked and trimmed; a string is the reason it is refused. */
export function cleanCompileRequest(body: Record<string, unknown>): CompileRequest | string {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const name = str(body.name);
  const description = str(body.description);
  const comply = list(body.comply).filter((k) => COMPLY_WITH.some((c) => c.key === k));
  const province = str(body.province);
  const guidelineIds = list(body.guidelineIds).slice(0, 5);
  if (!name) return "Give the policy a name.";
  if (name.length > MAX_NAME) return "The name is too long.";
  if (!description) return "Describe the policy you need.";
  if (description.length > MAX_DESCRIPTION) return "The description is too long.";
  if (!comply.length && !guidelineIds.length) return "Choose at least one law or guideline to comply with.";
  if (comply.includes("provincial") && !(PROVINCES as readonly string[]).includes(province)) return "Choose the province.";
  return { name, description, comply, province, guidelineIds };
}

const SYSTEM =
  "You draft policies for South African schools, for adoption by the SGB or board of governors (public schools have an SGB; independent schools have a board of governors, so say 'SGB or board of governors' unless the school type is given). " +
  "Be accurate above all: cite the Act and section (e.g. SASA s20(1)(b)) for every legal duty you rely on, use the law as amended by the BELA Act where that applies, and never invent a section, regulation, circular number or date. " +
  "Where something depends on a provincial circular you cannot be sure of, write that the school must check the current circular rather than guessing. " +
  "Where the policy needs a fact only the school knows (an amount, a time, a committee's name), write a placeholder in square brackets such as [number of days], never a made-up value. " +
  "Structure: the policy title as the first line, then numbered sections such as 1. Purpose, 2. Scope, 3. Legal framework, 4. Definitions, the policy itself, roles and responsibilities, procedures, monitoring and review, and an adoption block with lines for the chairperson of the SGB or board of governors, the principal and the date. Number clauses as typed text (4.2, 4.2.1). " +
  "Plain, formal English. Output only the policy text: '# ' for the title and main section headings, '## ' for sub-headings, '- ' for bullets, a blank line between paragraphs. No bold, no tables, no preamble, no notes to the reader, no em dashes.";

async function write(content: Anthropic.ContentBlockParam[], deadline: number): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const client = new Anthropic({ apiKey, maxRetries: 2 });
  // Streamed: a full policy takes a minute or two to write out.
  const message = await client.messages
    .stream(
      { model: MODEL, max_tokens: 32000, output_config: { effort: "medium" }, system: SYSTEM, messages: [{ role: "user", content }] },
      { signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) }
    )
    .finalMessage();
  if (message.stop_reason === "refusal") throw new CompileError("The AI could not write this policy. Try describing it differently.");
  if (message.stop_reason === "max_tokens") throw new CompileError("This policy is too long to write in one go. Ask for a shorter one.");
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new CompileError("The AI returned nothing. Please try again.");
  return text;
}

export async function compilePolicy(req: CompileRequest, school: SchoolBranding, deadline: number): Promise<string> {
  const { blocks, names } = await sourceBlocks(req.guidelineIds);
  const laws = COMPLY_WITH.filter((c) => req.comply.includes(c.key)).map((c) =>
    c.key === "provincial" ? `${req.province} provincial education department guidelines` : c.label
  );
  const instruction = [
    `Draft the policy "${req.name}" for ${school.fullName}, a ${school.schoolType === "private" ? "independent school with a board of governors" : "public school with an SGB"}.`,
    `What the school needs: ${req.description}`,
    laws.length ? `It must comply with: ${laws.join("; ")}.` : "",
    names.length ? `It must also comply with the attached documents the school uploaded (${names.join(", ")}).` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return write([...blocks, { type: "text", text: instruction }], deadline);
}

/** The whole draft again with the change made, so what is reviewed is always one complete policy. */
export async function revisePolicy(name: string, draft: string, change: string, deadline: number): Promise<string> {
  return write(
    [
      {
        type: "text",
        text:
          `Here is the draft policy "${name}":\n\n<draft>\n${draft}\n</draft>\n\n` +
          `Make this change and return the complete revised policy, keeping everything else as it is:\n\n<change>\n${change}\n</change>`,
      },
    ],
    deadline
  );
}

/** The draft as a Word file on the school's letterhead: crest and name on top, its own footer and page numbers below. */
export async function policyDocx(name: string, text: string, school: SchoolBranding, crest: Buffer | null): Promise<Buffer> {
  const fullName = docxText(school.fullName);
  const footerText = cleanWordFooter(school.wordFooter ?? "");
  const top: Paragraph[] = [];
  const info = crest ? crestImage(crest) : null;
  if (crest && info) {
    top.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ data: crest, type: info.type, transformation: { width: Math.min(200, Math.round((96 * info.width) / info.height)), height: 96 } })],
      })
    );
  }
  top.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 360 }, children: [new TextRun({ text: fullName, bold: true, size: 28 })] }));

  const run = { size: 16, color: "888888" } as const;
  const doc = new Document({
    title: docxText(name),
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        footers: {
          default: new Footer({
            children: [
              ...(footerText
                ? [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { after: 60 },
                      children: footerText.split("\n").slice(0, MAX_WORD_FOOTER_LINES).map((line, i) => new TextRun({ ...run, text: line, break: i ? 1 : undefined })),
                    }),
                  ]
                : []),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ ...run, text: `${fullName}  |  ${docxText(name)}  |  Page ` }),
                  new TextRun({ ...run, children: [PageNumber.CURRENT] }),
                  new TextRun({ ...run, text: " of " }),
                  new TextRun({ ...run, children: [PageNumber.TOTAL_PAGES] }),
                ],
              }),
            ],
          }),
        },
        children: [
          ...top,
          ...parseTranscript(text).map((l) =>
            l.kind === "h1"
              ? new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 }, children: [new TextRun(l.text)] })
              : l.kind === "h2"
                ? new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 }, children: [new TextRun(l.text)] })
                : l.kind === "bullet"
                  ? new Paragraph({ bullet: { level: 0 }, children: [new TextRun(l.text)] })
                  : new Paragraph({ spacing: { after: 120 }, children: [new TextRun(l.text)] })
          ),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

/** A safe file name for the Word copy. */
export function policyFilename(name: string): string {
  return `${name.replace(/[\\/:*?"<>|\u0000-\u001F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Policy"}.docx`;
}
