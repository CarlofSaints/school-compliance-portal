import Anthropic from "@anthropic-ai/sdk";
import { extractTextFromBuffer } from "@/lib/pdfParser";

interface ComplianceResult {
  score: number;
  summary: string;
  risks: {
    severity: "low" | "medium" | "high";
    section: string;
    description: string;
    guideline_reference: string;
    suggestion: string;
  }[];
  sources?: { title: string; url: string }[];
}

const MAX_CHARS_POLICY = 80000;

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return (
    text.slice(0, maxChars) +
    "\n\n[... Document truncated due to length.]"
  );
}

// Shared instruction block. When the document is attached (PDF), `bodyText` is
// null and Claude reads the attachment directly; otherwise the extracted text
// is embedded inline.
function buildInstruction(
  mode: "policy" | "document",
  name: string,
  bodyText: string | null
): string {
  const typeLabel = mode === "policy" ? "school policy" : "school document";
  const body =
    bodyText === null
      ? `The ${typeLabel} is attached as a PDF document. Read it in full.`
      : `DOCUMENT TEXT:\n${bodyText}`;

  return `You are a South African education compliance expert. Analyze the following ${typeLabel} for compliance with GDE (Gauteng Department of Education) and DoE (national Department of Education) guidelines, SASA (South African Schools Act), the BELA Act (Basic Education Laws Amendment Act), and best practices for school governance.

DOCUMENT NAME: ${name}

${body}

Analyze this ${typeLabel} and return a JSON object with this exact structure:
{
  "score": <number 0-100 representing overall compliance score>,
  "summary": "<overall assessment in 2-3 sentences>",
  "risks": [
    {
      "severity": "low" | "medium" | "high",
      "section": "<section/area of the document>",
      "description": "<what the issue is>",
      "guideline_reference": "<which guideline/act/regulation it relates to>",
      "suggestion": "<how to fix it>"
    }
  ]
}

Be thorough but fair. A score of 100 means fully compliant. Identify specific sections that need attention. Return ONLY the JSON object, no other text.`;
}

// JSON Schema for structured outputs — guarantees the model returns valid,
// complete JSON in this exact shape (no regex extraction needed).
const RESULT_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "number" },
    summary: { type: "string" },
    risks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["low", "medium", "high"] },
          section: { type: "string" },
          description: { type: "string" },
          guideline_reference: { type: "string" },
          suggestion: { type: "string" },
        },
        required: [
          "severity",
          "section",
          "description",
          "guideline_reference",
          "suggestion",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["score", "summary", "risks"],
  additionalProperties: false,
} as const;

function tryParseResult(text: string): ComplianceResult | null {
  // Structured output → the whole text is valid JSON. The regex is a belt-and-
  // braces fallback for any stray wrapping prose.
  const candidates = [text];
  const match = text.match(/\{[\s\S]*\}/);
  if (match) candidates.push(match[0]);
  for (const candidate of candidates) {
    try {
      const result = JSON.parse(candidate) as ComplianceResult;
      if (
        typeof result.score === "number" &&
        result.summary &&
        Array.isArray(result.risks)
      ) {
        return result;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function analyze(
  content: Anthropic.ContentBlockParam[]
): Promise<ComplianceResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  // maxRetries covers transient Anthropic 5xx/overloaded errors with backoff.
  const client = new Anthropic({ apiKey, maxRetries: 4 });

  let message;
  try {
    message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 8192,
      // Structured output guarantees valid, complete JSON — eliminates the
      // intermittent "Unable to parse" fallback from truncated/wrapped output.
      output_config: {
        format: { type: "json_schema", schema: RESULT_SCHEMA },
      },
      messages: [{ role: "user", content }],
    });
  } catch (err) {
    if (
      err instanceof Anthropic.APIError &&
      typeof err.status === "number" &&
      err.status >= 500
    ) {
      // Anthropic-side error (e.g. api_error / overloaded). Already retried.
      const reqId = (err as { request_id?: string }).request_id;
      console.error("Anthropic API error during compliance check:", err.status, reqId, err.message);
      throw new Error(
        "The AI service is temporarily unavailable. Please try again in a moment."
      );
    }
    throw err;
  }

  const textBlock = message.content.find((b) => b.type === "text");
  const responseText = textBlock && textBlock.type === "text" ? textBlock.text : "";

  const parsed = tryParseResult(responseText);
  if (parsed) return parsed;

  // Distinguish a truncated analysis (token ceiling) from genuinely unparseable
  // output so the message is actionable rather than a silent score of 0.
  const truncated = message.stop_reason === "max_tokens";
  console.error(
    "Compliance check parse failed",
    truncated ? "(truncated at max_tokens)" : "",
    responseText.slice(0, 200)
  );
  return {
    score: 0,
    summary: truncated
      ? "The analysis was too long to finish in one response. Please try again or split the document."
      : "Unable to parse compliance check results. Please try again.",
    risks: [],
  };
}

// Text entry point (kept for callers that already have extracted text).
export async function runComplianceCheck(
  policyText: string,
  policyName: string,
  mode: "policy" | "document" = "policy"
): Promise<ComplianceResult> {
  const truncated = truncateText(policyText, MAX_CHARS_POLICY);
  return analyze([{ type: "text", text: buildInstruction(mode, policyName, truncated) }]);
}

// File entry point. PDFs are sent to Claude as a native document block (no
// server-side PDF parsing — avoids the fragile pdfjs/native-canvas path that
// crashed the serverless function). Other formats are text-extracted cheaply.
export async function runComplianceCheckOnFile(
  buffer: Buffer,
  ext: string,
  name: string,
  mode: "policy" | "document" = "policy"
): Promise<ComplianceResult> {
  const extension = ext.toLowerCase().replace(".", "");

  if (extension === "pdf") {
    return analyze([
      { type: "text", text: buildInstruction(mode, name, null) },
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: buffer.toString("base64"),
        },
      },
    ]);
  }

  const text = await extractTextFromBuffer(buffer, ext);
  return runComplianceCheck(text, name, mode);
}
