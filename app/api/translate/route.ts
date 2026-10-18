import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { requireLogin } from "@/lib/rolesData";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { getLocale } from "@/lib/i18n/server";
import { getPolicyById, getPolicyVersions, downloadPolicyFile } from "@/lib/policyData";
import { getMinutes } from "@/lib/minutesData";
import { sessionMayReadMinutes } from "@/lib/minutesAccess";
import { documentHash } from "@/lib/minutesSigning";
import { ATTENDANCE_STATUS_LABELS } from "@/lib/minutes";
import { extractTextFromBuffer } from "@/lib/pdfParser";
import {
  creditsFor,
  getCredits,
  pdfBlock,
  pdfPages,
  storedTranslation,
  textPages,
  translateContent,
  type ContentKind,
} from "@/lib/contentTranslation";

// A long policy can take several minutes to translate in full. 800s is the
// Vercel Pro ceiling.
export const maxDuration = 800;

// { kind: "policy" | "minutes", id } -> the stored translation, or else a
// quote { credits, pages, balance } for a new one. Send again with
// confirm: true to spend the credits and translate.
export async function POST(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  let body: { kind?: unknown; id?: unknown; confirm?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // Falls through to the 400 below.
  }
  const kind = body.kind;
  const id = body.id;
  if ((kind !== "policy" && kind !== "minutes") || typeof id !== "string" || !/^[\w-]{1,80}$/.test(id)) {
    return NextResponse.json({ error: "kind and id are required" }, { status: 400 });
  }
  const locale = await getLocale();

  // The same read rule as the document itself: whoever cannot open it cannot
  // have it translated, and gets the same 404 as for one that does not exist.
  let title: string;
  let sourceHash: string;
  let source: () => Promise<{ content: Anthropic.ContentBlockParam[]; pages: number }>;
  if (kind === "policy") {
    if (!session.permissions.includes("download_policies")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const policy = await getPolicyById(id);
    const version = policy && (await getPolicyVersions(id)).find((v) => v.version === policy.currentVersion);
    if (!policy || !version) return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    title = policy.name;
    sourceHash = `v${version.version}`;
    const ext = version.ext.toLowerCase().replace(".", "");
    // Only what can be read as text. Anything else would be priced (and
    // translated) as raw bytes.
    if (!["pdf", "docx", "txt", "md"].includes(ext)) {
      return NextResponse.json(
        { error: "Only PDF, Word (.docx) and text policies can be translated." },
        { status: 400 }
      );
    }
    source = async () => {
      const file = await downloadPolicyFile(id, version.version, version.ext);
      if (!file) throw new Error("Policy file missing");
      if (ext === "pdf") {
        return { content: [pdfBlock(file)], pages: await pdfPages(file) };
      }
      const text = await extractTextFromBuffer(file, version.ext);
      if (!text.trim() || text.startsWith("[Could not extract")) throw new Error("No readable text");
      return { content: [{ type: "text", text }], pages: textPages(text) };
    };
  } else {
    const record = await getMinutes(id);
    if (!record || !(await sessionMayReadMinutes(session, record))) {
      return NextResponse.json({ error: "Minutes not found" }, { status: 404 });
    }
    title = record.title;
    sourceHash = documentHash(record);
    source = async () => {
      const text = [...record.sections]
        .sort((a, b) => a.order - b.order)
        .map((s) => {
          const rows = (s.attendees || [])
            .map((r) => `- ${r.position}: ${r.name}${r.status ? ` (${ATTENDANCE_STATUS_LABELS[r.status]})` : ""}`)
            .join("\n");
          return `# ${s.title}\n${[s.body, rows, s.responsible ? `Responsible: ${s.responsible}` : ""].filter(Boolean).join("\n")}`;
        })
        .join("\n\n");
      return { content: [{ type: "text", text }], pages: textPages(text) };
    };
  }

  const stored = await storedTranslation(kind as ContentKind, id, locale, sourceHash);
  if (stored) return NextResponse.json(stored);

  const quoteLimited = await enforce([[LIMITS.translateQuoteUser, session.id]]);
  if (quoteLimited) return quoteLimited;

  let loaded: Awaited<ReturnType<typeof source>>;
  try {
    loaded = await source();
  } catch (err) {
    console.error("[translate] could not read the source", kind, id, err);
    return NextResponse.json({ error: "This document could not be read for translation." }, { status: 502 });
  }
  const credits = creditsFor(loaded.pages);
  if (body.confirm !== true) {
    return NextResponse.json({ quote: { credits, pages: loaded.pages, balance: await getCredits() } });
  }

  // Only a NEW translation is a paid AI call, so only that is rate limited.
  const limited = await enforce([[LIMITS.translateUser, session.id]]);
  if (limited) return limited;

  const result = await translateContent({
    kind: kind as ContentKind,
    id,
    locale,
    sourceHash,
    title,
    credits,
    content: loaded.content,
  });
  return result.ok
    ? NextResponse.json(result)
    : NextResponse.json({ error: result.error }, { status: result.status });
}
