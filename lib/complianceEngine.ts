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

async function analyze(
  content: Anthropic.ContentBlockParam[]
): Promise<ComplianceResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4096,
    messages: [{ role: "user", content }],
  });

  const responseText =
    message.content[0].type === "text" ? message.content[0].text : "";

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    const result = JSON.parse(jsonMatch[0]) as ComplianceResult;

    if (
      typeof result.score !== "number" ||
      !result.summary ||
      !Array.isArray(result.risks)
    ) {
      throw new Error("Invalid response structure");
    }

    return result;
  } catch {
    return {
      score: 0,
      summary:
        "Unable to parse compliance check results. Please try again.",
      risks: [],
    };
  }
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
