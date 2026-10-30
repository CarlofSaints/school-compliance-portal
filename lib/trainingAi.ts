import Anthropic from "@anthropic-ai/sdk";
import { extractTextFromBuffer } from "./pdfParser";
import { downloadGuidelineFile, getGuidelines } from "./guidelineData";

// ---------------------------------------------------------------------------
// AI-built training: lessons plus a test on a piece of South African school
// law or guidance. Everything it makes is saved as a DRAFT in the same editors
// used for training loaded by hand, so a person reads and corrects it before
// anybody is taught from it. The school's own uploaded guidelines
// (Compliance > Guidelines) can be attached as the source.
// ---------------------------------------------------------------------------

const MODEL = "claude-opus-5-5";

export { TRAINING_TOPICS, PROVINCES } from "./trainingTopics";

export interface GenerateRequest {
  topic: string;
  province: string;
  focus: string;
  audience: string;
  lessons: number;
  questions: number;
  guidelineIds: string[];
}

export interface GeneratedModule {
  title: string;
  description: string;
  lessons: { title: string; summary: string; body: string }[];
  test: {
    title: string;
    questions: {
      type: "single" | "multi" | "truefalse" | "text";
      text: string;
      options: { text: string; isCorrect: boolean }[];
      acceptedAnswers: string[];
      explanation: string;
    }[];
  };
}

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    lessons: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, summary: { type: "string" }, body: { type: "string" } },
        required: ["title", "summary", "body"],
        additionalProperties: false,
      },
    },
    test: {
      type: "object",
      properties: {
        title: { type: "string" },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["single", "multi", "truefalse", "text"] },
              text: { type: "string" },
              options: {
                type: "array",
                items: {
                  type: "object",
                  properties: { text: { type: "string" }, isCorrect: { type: "boolean" } },
                  required: ["text", "isCorrect"],
                  additionalProperties: false,
                },
              },
              acceptedAnswers: { type: "array", items: { type: "string" } },
              explanation: { type: "string" },
            },
            required: ["type", "text", "options", "acceptedAnswers", "explanation"],
            additionalProperties: false,
          },
        },
      },
      required: ["title", "questions"],
      additionalProperties: false,
    },
  },
  required: ["title", "description", "lessons", "test"],
  additionalProperties: false,
} as const;

export class GenerateError extends Error {}

// Source documents: PDFs go to Claude whole (it reads scans too); Word and
// text are extracted. Capped so the request stays inside the API's size limit.
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

async function sourceBlocks(ids: string[]): Promise<{ blocks: Anthropic.ContentBlockParam[]; names: string[] }> {
  const all = await getGuidelines();
  const blocks: Anthropic.ContentBlockParam[] = [];
  const names: string[] = [];
  let bytes = 0;
  for (const g of all.filter((x) => ids.includes(x.id)).slice(0, 5)) {
    const file = await downloadGuidelineFile(g.id, g.ext);
    if (!file || bytes + file.length > MAX_SOURCE_BYTES) continue;
    bytes += file.length;
    names.push(g.name);
    if (g.ext.toLowerCase() === "pdf") {
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: file.toString("base64") }, title: g.name });
    } else {
      blocks.push({ type: "text", text: `SOURCE DOCUMENT "${g.name}":\n${(await extractTextFromBuffer(file, g.ext)).slice(0, 200_000)}` });
    }
  }
  return { blocks, names };
}

export async function generateModule(req: GenerateRequest, deadline: number): Promise<GeneratedModule> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const { blocks, names } = await sourceBlocks(req.guidelineIds);

  const subject =
    req.topic === "Provincial education guidelines" ? `${req.province} provincial education department guidelines` : req.topic;
  const instruction = [
    `Build a training module on: ${subject}.`,
    req.focus ? `Focus on: ${req.focus}.` : "",
    `The learners are: ${req.audience || "school governing body (SGB) or board of governors members and school staff"}.`,
    `Write ${req.lessons} lessons and a test of ${req.questions} questions.`,
    names.length
      ? `Base the module on the attached source documents (${names.join(", ")}). Where they are silent, you may use the governing legislation, and say so.`
      : "No source documents are attached: use the legislation and official guidance as you know it.",
  ]
    .filter(Boolean)
    .join("\n");

  const client = new Anthropic({ apiKey, maxRetries: 2 });
  const message = await client.messages
    .stream(
      {
        model: MODEL,
        max_tokens: 32000,
        output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
        system:
          "You write training for South African school governors and staff (public schools have an SGB; independent schools have a board of governors, so say 'SGB or board of governors'). " +
          "Be accurate above all: cite the Act and section (e.g. SASA s20(1)(b)) for every rule you state, use the law as amended by the BELA Act where that applies, and never invent a section, circular number or date. " +
          "Where something depends on a provincial circular you cannot be sure of, tell the reader to check the current circular rather than guessing. " +
          "Lessons: plain English, short paragraphs, practical school examples, written in markdown using '## ' sub-headings and '- ' bullets, 300 to 700 words each, ending with a short 'Key points' list. " +
          "Test: mostly single-choice (4 options, exactly one correct) and true/false (options 'True' and 'False'), a few multi-choice (all correct ones ticked), and at most one typed-answer question whose accepted answers are short and unambiguous. " +
          "Every question must be answerable from the lessons, and every explanation names the section it comes from. No em dashes.",
        messages: [{ role: "user", content: [...blocks, { type: "text", text: instruction }] }],
      },
      { signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) }
    )
    .finalMessage();

  if (message.stop_reason === "refusal") throw new GenerateError("The AI could not build this module. Try a different focus.");
  if (message.stop_reason === "max_tokens") throw new GenerateError("That module was too big to build in one go. Ask for fewer lessons or questions.");
  const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  try {
    return JSON.parse(text) as GeneratedModule;
  } catch {
    throw new GenerateError("The AI's answer could not be read. Please try again.");
  }
}
