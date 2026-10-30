import Anthropic from "@anthropic-ai/sdk";
import type { SessionPayload } from "./roles";
import { listMinutes, readOriginalFile, formatPeriod, MEETING_BODY_LABELS, type MinutesRecord } from "./minutesData";
import { readableMinutes, visibleActionsFor } from "./minutesAccess";
import { getActionItems } from "./actionItemData";
import { getSpendApplications } from "./spendData";
import { resolveBranding } from "./brandingData";
import { extractTextFromBuffer } from "./pdfParser";
import { LOCALES, type Locale } from "./i18n/locales";

// ---------------------------------------------------------------------------
// "Ask Jono": a question box on every page. Jono answers from the school's own
// records (minutes, action items, spend projects) and from South African
// education law.
//
// 🔴 Jono only ever sees what THE PERSON ASKING may see: minutes through
// readableMinutes (a FINCOM-only set never reaches a non-FINCOM reader),
// actions through visibleActionsFor, spend through the same rule as the Spend
// page (everything with view_all_spend, otherwise only their own). Building the
// context once for the whole school would leak restricted minutes through a
// question.
// ---------------------------------------------------------------------------

const MODEL = "claude-opus-5-5";
// The records are trimmed oldest-first to stay well inside the context window.
const MAX_CONTEXT_CHARS = 400_000;
const MAX_MINUTES_SETS = 24;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

async function minutesText(m: MinutesRecord): Promise<string> {
  const head = `=== MINUTES: ${m.title} | ${MEETING_BODY_LABELS[m.body] ?? m.body} | meeting ${m.meetingDate ?? formatPeriod(m.period)} | ${m.status}${m.signedAt ? ", signed" : ""} ===`;
  let body = [...m.sections]
    .sort((a, b) => a.order - b.order)
    .filter((s) => s.body.trim())
    .map((s) => `## ${s.title}\n${s.body.trim()}`)
    .join("\n\n");
  // A set that was only uploaded as a Word file has no sections: read the file.
  if (!body && m.original && /wordprocessingml|msword|text\/plain/.test(m.original.contentType)) {
    const file = await readOriginalFile(m.id).catch(() => null);
    const ext = m.original.filename.split(".").pop() || "docx";
    if (file) body = (await extractTextFromBuffer(file, ext)).slice(0, 40_000);
  }
  return `${head}\n${body || "(no text in the portal: an uploaded file only)"}`;
}

/** Everything this person may see, as text, newest meetings first. */
export async function recordsFor(session: SessionPayload): Promise<string> {
  const [minutes, actions, spend] = await Promise.all([
    listMinutes().then((all) => readableMinutes(session, all)),
    getActionItems().then((all) => visibleActionsFor(session, all)),
    session.permissions.includes("view_all_spend") || session.permissions.includes("submit_spend")
      ? getSpendApplications()
      : Promise.resolve([]),
  ]);

  const recent = minutes
    .sort((a, b) => (b.meetingDate ?? b.createdAt).localeCompare(a.meetingDate ?? a.createdAt))
    .slice(0, MAX_MINUTES_SETS);
  const minuteBlocks = await Promise.all(recent.map(minutesText));

  const actionLines = actions.map((a) => {
    const last = a.updates?.at(-1);
    return `${a.ref} | ${a.title} | ${a.status}, ${a.progress}% | due ${a.dueDate || "no date"} | ${a.assigneeNames.join(", ") || "unassigned"}${
      a.description ? ` | ${a.description.slice(0, 400)}` : ""
    }${last ? ` | latest update ${last.at.slice(0, 10)} by ${last.byName}: ${last.note.slice(0, 400)}` : ""}`;
  });

  const seeAll = session.permissions.includes("view_all_spend");
  const spendLines = spend
    .filter((s) => seeAll || s.submittedBy === session.id)
    .map(
      (s) =>
        `${s.projectName} | ${s.status}${s.projectProgress ? `, ${s.projectProgress}` : ""} | R${s.approvedAmount ?? s.estimatedAmount} | submitted ${s.submittedAt.slice(0, 10)} by ${s.submittedByName}${
          s.description ? ` | ${s.description.slice(0, 300)}` : ""
        }`
    );

  const parts = [
    `ACTION ITEMS (${actionLines.length}):\n${actionLines.join("\n") || "none"}`,
    `SPEND PROJECTS (${spendLines.length}):\n${spendLines.join("\n") || "none visible to this person"}`,
  ];
  let total = parts.join("\n\n").length;
  for (const block of minuteBlocks) {
    if (total + block.length > MAX_CONTEXT_CHARS) break;
    parts.push(block);
    total += block.length;
  }
  return parts.join("\n\n");
}

export class JonoError extends Error {}

export async function askJono(session: SessionPayload, turns: ChatTurn[], locale: Locale): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const [records, branding] = await Promise.all([recordsFor(session), resolveBranding()]);
  const language = LOCALES.find((l) => l.code === locale)?.label ?? "English";
  const today = new Date().toISOString().slice(0, 10);

  const client = new Anthropic({ apiKey, maxRetries: 2 });
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low" },
    system: [
      {
        type: "text",
        text:
          `You are Jono, the assistant inside ${branding.fullName}'s governance portal (School Compliance). Today is ${today}. You are talking to ${session.name} ${session.surname} (${session.roleName}).\n\n` +
          "Two kinds of question come to you:\n" +
          "1. About this school's own business (meetings, decisions, projects, actions, spending). Answer ONLY from the school records below. Say which meeting and date, or which action reference (e.g. A-014), your answer comes from. Pull together everything the records say on a topic in date order, newest last, and say clearly what is still open. If the records do not cover it, say so plainly; never guess or invent a decision.\n" +
          "2. About the law and rules for South African schools (discipline, suspension and expulsion, admissions, fees, SGB or board of governors powers, safety, employment). Answer from the South African Schools Act 84 of 1996 as amended by the BELA Act 32 of 2024, the Children's Act, the Employment of Educators Act, the Guidelines for the Consideration of Governing Bodies in Adopting a Code of Conduct for Learners, and provincial regulations, citing the Act and section. Give the practical steps the school must follow (e.g. a fair hearing before a suspension). Where the answer depends on a provincial regulation or circular you are not sure of, say so and tell them to check with the district office. For a serious or urgent matter (a child hurt, abuse, a criminal act), give the immediate duties first (e.g. the duty to report abuse under s110 of the Children's Act) and add that this is guidance, not legal advice.\n" +
          "Public schools have an SGB; independent schools have a board of governors, so say 'SGB or board of governors' when speaking generally. Be concise: short paragraphs, '- ' bullets, '## ' for a heading only in a long answer. No em dashes. " +
          `Reply in ${language} unless the person writes in another language, then use theirs.`,
      },
      {
        type: "text",
        text: `SCHOOL RECORDS this person may see (minutes newest first, possibly trimmed):\n\n${records}`,
        // The records are the same for every question in a conversation, so they are cached.
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: turns,
  });

  if (message.stop_reason === "refusal") throw new JonoError("Jono cannot answer that one.");
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new JonoError("Jono had nothing to say. Try asking another way.");
  return text;
}

/** The conversation as it may be sent on: alternating, starting and ending with the person, capped. */
export function cleanTurns(raw: unknown): ChatTurn[] | null {
  if (!Array.isArray(raw)) return null;
  const turns = raw
    .slice(-12)
    .map((t) => (t ?? {}) as Record<string, unknown>)
    .filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.trim())
    .map((t) => ({ role: t.role as ChatTurn["role"], content: (t.content as string).slice(0, 4000) }));
  while (turns.length && turns[0].role !== "user") turns.shift();
  if (!turns.length || turns.at(-1)!.role !== "user") return null;
  if (turns.some((t, i) => i > 0 && t.role === turns[i - 1].role)) return null;
  return turns;
}
