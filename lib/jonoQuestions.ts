import { timingSafeEqual } from "node:crypto";
import { readJson, updateJson, deleteFile } from "./controlData";
import { runInControlStore } from "./tenantContext";
import { isMultiTenant } from "./tenantRegistry";

// ---------------------------------------------------------------------------
// The "how do I..." questions Jono could NOT answer from the guide, kept so
// Carl can review them monthly and grow the free library.
//
// Carl chose: ONLY "how do I use the portal" questions the guide missed (never
// questions about a school's minutes, people or the law), school + date +
// language, NO name, 12 months. The Jono panel and the privacy policy say so.
//
// Where they go:
//   - the multi-tenant platform: straight into the control store
//     (_platform/jono-questions/<YYYY-MM>.json), seen on /platform/jono-questions;
//   - HVPS and Jeppe (their own deployments): POSTed to the platform with
//     JONO_REVIEW_URL + JONO_REVIEW_SECRET; until those are set, kept in their
//     own store under the same path, so nothing breaks and nothing is lost.
// ---------------------------------------------------------------------------

export interface JonoQuestion {
  at: string;
  school: string;
  locale: string;
  question: string;
  /** "ai": the guide had no match. "missed": the free answer was wrong ("Ask the AI instead"). */
  outcome: "ai" | "missed";
}

export const KEEP_MONTHS = 12;
const path = (month: string) => `jono-questions/${month}.json`;
const monthOf = (iso: string) => iso.slice(0, 7);

/** The month that falls out of the 12 kept when `month` is written. */
export function expiredMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - KEEP_MONTHS, 1));
  return d.toISOString().slice(0, 7);
}

/** One question as it may be stored: trimmed, capped, nothing else. */
export function cleanQuestion(raw: unknown): JonoQuestion | null {
  const q = raw as Partial<JonoQuestion> | null;
  const question = String(q?.question ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
  const school = String(q?.school ?? "").trim().slice(0, 120);
  if (!question || !school) return null;
  const at = /^\d{4}-\d{2}-\d{2}T/.test(String(q?.at)) ? String(q?.at) : new Date().toISOString();
  return {
    at,
    school,
    locale: String(q?.locale ?? "en").slice(0, 8),
    question,
    outcome: q?.outcome === "missed" ? "missed" : "ai",
  };
}

/** Appends to this month's list in the CURRENT store, dropping the month that expired. */
async function append(item: JonoQuestion): Promise<void> {
  const month = monthOf(item.at);
  await updateJson<JonoQuestion[]>(path(month), [], (list) => [...list, item].slice(-5000));
  await deleteFile(path(expiredMonth(month))).catch(() => {});
}

/** Into the platform's own store (on the multi-tenant deployment). */
export function storeOnPlatform(item: JonoQuestion): Promise<void> {
  return runInControlStore(() => append(item));
}

/**
 * Called by Ask Jono. Never throws and never slows the answer much: a lost
 * review entry must not cost anybody their answer.
 */
export async function keepJonoQuestion(item: JonoQuestion): Promise<void> {
  try {
    if (isMultiTenant()) return await storeOnPlatform(item);
    const url = process.env.JONO_REVIEW_URL;
    const secret = process.env.JONO_REVIEW_SECRET;
    if (url && secret) {
      const res = await fetch(`${url.replace(/\/$/, "")}/api/jono-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-jono-review-secret": secret },
        body: JSON.stringify(item),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return;
      console.error("[jono review] platform refused:", res.status);
    }
    // Not set up yet (or the platform is down): kept here instead.
    await append(item);
  } catch (err) {
    console.error("[jono review] could not keep a question:", err);
  }
}

/** True when the request carries the shared secret (constant-time compare). */
export function secretMatches(given: string | null): boolean {
  const want = process.env.JONO_REVIEW_SECRET;
  if (!want || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** For the review page: the months kept, newest first, each with its questions. */
export async function listPlatformQuestions(): Promise<{ month: string; items: JonoQuestion[] }[]> {
  return runInControlStore(async () => {
    const now = new Date().toISOString().slice(0, 7);
    const months: string[] = [];
    for (let i = 0; i < KEEP_MONTHS; i++) {
      const [y, m] = now.split("-").map(Number);
      months.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
    }
    const out = [];
    for (const month of months) {
      const items = await readJson<JonoQuestion[]>(path(month), []);
      if (items.length) out.push({ month, items: [...items].reverse() });
    }
    return out;
  });
}
