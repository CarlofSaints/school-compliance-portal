import { randomBytes } from "crypto";
import { writeJson } from "./controlData";

// "Report a bug or request a feature" (Carl, 27 Oct). Any signed-in user. The
// person gets an email with the ticket number; School Compliance gets the
// detail. Each ticket is also kept in the school's own store, so a lost email
// is not a lost report.

export const FEEDBACK_KINDS = ["bug", "feature"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const KIND_LABELS: Record<FeedbackKind, string> = { bug: "Bug report", feature: "Feature request" };

const MAX_SUMMARY = 120;
const MAX_DETAIL = 5000;

export interface Feedback {
  ticket: string;
  kind: FeedbackKind;
  summary: string;
  detail: string;
  /** The portal page they were on when they opened the form, if any. */
  page: string;
  from: { id: string; name: string; email: string };
  at: string;
}

/** The request body checked, or the reason it is refused. */
export function parseFeedback(body: unknown): { kind: FeedbackKind; summary: string; detail: string; page: string } | { error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const kind = b.kind;
  if (!FEEDBACK_KINDS.includes(kind as FeedbackKind)) return { error: "Choose a bug report or a feature request." };
  const summary = str(b.summary);
  const detail = str(b.detail);
  if (!summary) return { error: "Give it a short title." };
  if (summary.length > MAX_SUMMARY) return { error: `Keep the title to ${MAX_SUMMARY} characters.` };
  if (!detail) return { error: "Describe it in a few lines." };
  if (detail.length > MAX_DETAIL) return { error: `Keep the description to ${MAX_DETAIL} characters.` };
  // Only a portal path is kept: it goes into an email link.
  const page = /^\/[\w\-/[\]]{0,200}$/.test(str(b.page)) ? str(b.page) : "";
  return { kind: kind as FeedbackKind, summary, detail, page };
}

// No 0/O or 1/I, so it can be read out over the phone.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newTicket(): string {
  return "SC-" + [...randomBytes(6)].map((n) => ALPHABET[n % ALPHABET.length]).join("");
}

export async function saveFeedback(f: Omit<Feedback, "ticket" | "at">): Promise<Feedback> {
  const fb: Feedback = { ...f, ticket: newTicket(), at: new Date().toISOString() };
  await writeJson(`feedback/${fb.ticket}.json`, fb);
  return fb;
}
