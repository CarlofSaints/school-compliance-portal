import Anthropic from "@anthropic-ai/sdk";
import { getGuidelines, downloadGuidelineFile } from "./guidelineData";
import { extractTextFromBuffer } from "./pdfParser";

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

// Truncate text to stay within reasonable token limits
// ~4 chars per token, aim for ~50k tokens max per guideline
const MAX_CHARS_PER_GUIDELINE = 200000;
const MAX_CHARS_POLICY = 200000;

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return (
    text.slice(0, maxChars) +
    "\n\n[... Document truncated due to length. Key sections above should cover primary compliance areas.]"
  );
}

export async function runComplianceCheck(
  policyText: string,
  policyName: string,
  mode: "policy" | "document" = "policy"
): Promise<ComplianceResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const client = new Anthropic({ apiKey });

  // Load all guideline texts
  const guidelines = await getGuidelines();
  const guidelineTexts: string[] = [];

  for (const g of guidelines) {
    const fileBuffer = await downloadGuidelineFile(g.id, g.ext);
    if (fileBuffer) {
      try {
        const text = await extractTextFromBuffer(fileBuffer, g.ext);
        guidelineTexts.push(
          `--- Guideline: ${g.name} (Source: ${g.source}) ---\n${truncateText(text, MAX_CHARS_PER_GUIDELINE)}\n`
        );
      } catch {
        guidelineTexts.push(
          `--- Guideline: ${g.name} (Source: ${g.source}) ---\n[Could not extract text]\n`
        );
      }
    }
  }

  const guidelineSection =
    guidelineTexts.length > 0
      ? `\n\nREFERENCE GUIDELINES:\n${guidelineTexts.join("\n")}`
      : "";

  const typeLabel = mode === "policy" ? "school policy" : "school document";
  const truncatedPolicy = truncateText(policyText, MAX_CHARS_POLICY);

  const prompt = `You are a South African education compliance expert. Analyze the following ${typeLabel} for compliance with GDE (Gauteng Department of Education) and DoE (national Department of Education) guidelines, SASA (South African Schools Act), the BELA Act (Basic Education Laws Amendment Act), and best practices for school governance.

IMPORTANT: Use the web search tool to look up the latest versions of relevant South African education legislation, including:
- BELA Act (Basic Education Laws Amendment Act) requirements
- SASA (South African Schools Act) current provisions
- GDE (Gauteng Department of Education) latest circulars and guidelines
- DoE (Department of Basic Education) current regulations
Search for any specific regulations mentioned in or relevant to this document.

DOCUMENT NAME: ${policyName}

DOCUMENT TEXT:
${truncatedPolicy}
${guidelineSection}

After researching the latest regulations online and reviewing the uploaded guidelines above, analyze this ${typeLabel} and return a JSON object with this exact structure:
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

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        type: "web_search_20250305" as const,
        name: "web_search",
        max_uses: 5,
      },
    ],
  });

  // Extract text from response - with web search, there may be multiple content blocks
  let responseText = "";
  const sources: { title: string; url: string }[] = [];

  for (const block of message.content) {
    if (block.type === "text") {
      responseText += block.text;
      // Collect citations if present
      if ("citations" in block && Array.isArray(block.citations)) {
        for (const citation of block.citations) {
          if (
            citation.type === "web_search_result_location" &&
            citation.url &&
            citation.title
          ) {
            // Avoid duplicate sources
            if (!sources.some((s) => s.url === citation.url)) {
              sources.push({ title: citation.title, url: citation.url });
            }
          }
        }
      }
    }
  }

  try {
    // Extract JSON from response (handle potential markdown wrapping)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    const result = JSON.parse(jsonMatch[0]) as ComplianceResult;

    // Validate structure
    if (
      typeof result.score !== "number" ||
      !result.summary ||
      !Array.isArray(result.risks)
    ) {
      throw new Error("Invalid response structure");
    }

    // Attach web sources
    if (sources.length > 0) {
      result.sources = sources;
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
