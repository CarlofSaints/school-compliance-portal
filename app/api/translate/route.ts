import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { requireLogin } from "@/lib/rolesData";
import { getUserById } from "@/lib/userData";
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

type Session = Exclude<Awaited<ReturnType<typeof requireLogin>>, NextResponse>;

interface Doc {
  kind: ContentKind;
  id: string;
  title: string;
  sourceHash: string;
  source: () => Promise<{ content: Anthropic.ContentBlockParam[]; pages: number }>;
}

/** Ticked per user on the Users screen. Read fresh, never from the session. */
async function maySpend(session: Session): Promise<boolean> {
  return !!(await getUserById(session.id))?.canSpendTranslationCredits;
}

// The same read rule as the document itself: whoever cannot open it cannot
// have it translated, and gets the same 404 as for one that does not exist.
async function resolveDoc(session: Session, kind: unknown, id: unknown): Promise<Doc | NextResponse> {
  if ((kind !== "policy" && kind !== "minutes") || typeof id !== "string" || !/^[\w-]{1,80}$/.test(id)) {
    return NextResponse.json({ error: "kind and id are required" }, { status: 400 });
  }
  if (kind === "policy") {
    if (!session.permissions.includes("download_policies")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const policy = await getPolicyById(id);
    const version = policy && (await getPolicyVersions(id)).find((v) => v.version === policy.currentVersion);
    if (!policy || !version) return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    const ext = version.ext.toLowerCase().replace(".", "");
    // Only what can be read as text. Anything else would be priced (and
    // translated) as raw bytes.
    if (!["pdf", "docx", "txt", "md"].includes(ext)) {
      return NextResponse.json(
        { error: "Only PDF, Word (.docx) and text policies can be translated." },
        { status: 400 }
      );
    }
    return {
      kind,
      id,
      title: policy.name,
      sourceHash: `v${version.version}`,
      source: async () => {
        const file = await downloadPolicyFile(id, version.version, version.ext);
        if (!file) throw new Error("Policy file missing");
        if (ext === "pdf") {
          return { content: [pdfBlock(file)], pages: await pdfPages(file) };
        }
        const text = await extractTextFromBuffer(file, version.ext);
        if (!text.trim() || text.startsWith("[Could not extract")) throw new Error("No readable text");
        return { content: [{ type: "text", text }], pages: textPages(text) };
      },
    };
  }
  const record = await getMinutes(id);
  if (!record || !(await sessionMayReadMinutes(session, record))) {
    return NextResponse.json({ error: "Minutes not found" }, { status: 404 });
  }
  return {
    kind,
    id,
    title: record.title,
    sourceHash: documentHash(record),
    source: async () => {
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
    },
  };
}

// ?kind=&id= -> what the Translate button needs to know before it is clicked:
// { stored, balance, canSpend }. Cheap: never reads the document itself.
export async function GET(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  const params = req.nextUrl.searchParams;
  const doc = await resolveDoc(session, params.get("kind"), params.get("id"));
  if (doc instanceof NextResponse) return doc;
  const locale = await getLocale();
  const [stored, balance, canSpend] = await Promise.all([
    locale === "en" ? null : storedTranslation(doc.kind, doc.id, locale, doc.sourceHash),
    getCredits(),
    maySpend(session),
  ]);
  return NextResponse.json({ stored: !!stored, balance, canSpend });
}

// { kind: "policy" | "minutes", id } -> the stored translation, or else a
// quote { credits, pages, balance } for a new one. Send again with
// confirm: true to spend the credits and translate.
export async function POST(req: NextRequest) {
  // The model must finish by here, leaving time to refund before the 800s cut.
  const deadline = Date.now() + 760_000;
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  let body: { kind?: unknown; id?: unknown; confirm?: unknown; credits?: unknown; sourceHash?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // Falls through to the 400 in resolveDoc.
  }
  const doc = await resolveDoc(session, body.kind, body.id);
  if (doc instanceof NextResponse) return doc;
  const locale = await getLocale();

  const stored = await storedTranslation(doc.kind, doc.id, locale, doc.sourceHash);
  if (stored) return NextResponse.json(stored);

  // A new translation spends the school's credits, so only a user ticked for
  // it may even price one.
  if (!(await maySpend(session))) {
    return NextResponse.json(
      { error: "You are not allowed to spend translation credits. Ask your administrator to tick \"Can spend translation credits\" on your user." },
      { status: 403 }
    );
  }

  const quoteLimited = await enforce([[LIMITS.translateQuoteUser, session.id]]);
  if (quoteLimited) return quoteLimited;

  let loaded: Awaited<ReturnType<Doc["source"]>>;
  try {
    loaded = await doc.source();
  } catch (err) {
    console.error("[translate] could not read the source", doc.kind, doc.id, err);
    return NextResponse.json({ error: "This document could not be read for translation." }, { status: 502 });
  }
  const credits = creditsFor(loaded.pages);
  const quote = { credits, pages: loaded.pages, balance: await getCredits(), sourceHash: doc.sourceHash };
  if (body.confirm !== true) return NextResponse.json({ quote });
  // Never charge other than what was agreed: a new version uploaded between
  // the quote and the click is priced again and shown, not silently charged.
  if (body.credits !== credits || body.sourceHash !== doc.sourceHash) {
    return NextResponse.json({ quote, changed: true });
  }

  // Only a NEW translation is a paid AI call, so only that is rate limited.
  const limited = await enforce([[LIMITS.translateUser, session.id]]);
  if (limited) return limited;

  const result = await translateContent({
    kind: doc.kind,
    id: doc.id,
    locale,
    sourceHash: doc.sourceHash,
    title: doc.title,
    credits,
    content: loaded.content,
    deadline,
  });
  return result.ok
    ? NextResponse.json(result)
    : NextResponse.json({ error: result.error }, { status: result.status });
}
