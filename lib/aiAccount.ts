import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { afterResponse } from "./activityActor";
import { isAiOutOfCredit } from "./aiErrors";
import { NO_CHANGE, updateJson, writeJson } from "./controlData";
import { sendAiOutOfCreditEmail } from "./email";
import { getT } from "./i18n/server";
import { tk } from "./i18n/translate";
import { runInControlStore } from "./tenantContext";

const MESSAGE = tk("The AI service this portal uses is temporarily unavailable because its account needs a top-up. You do not need to buy anything and your school's credits are not affected. Please let your portal administrator know.");

const ALERT_FILE = "ai-alerts/out-of-credit.json";
const ALERT_EVERY_MS = 6 * 60 * 60 * 1000;

/** At most one email per deployment per six hours, however many people are refused. Never throws: an alert must not change what the user sees. */
async function alertOutOfCredit(res: Response, body: string): Promise<void> {
  let claimed = false;
  try {
    await runInControlStore(() =>
      updateJson<{ at: number }>(ALERT_FILE, { at: 0 }, (cur) => {
        claimed = Date.now() - cur.at >= ALERT_EVERY_MS;
        return claimed ? { at: Date.now() } : NO_CHANGE;
      })
    );
    if (!claimed) return;
    let requestId = res.headers.get("request-id") ?? "";
    try {
      requestId ||= (JSON.parse(body) as { request_id?: string }).request_id ?? "";
    } catch {}
    if (await sendAiOutOfCreditEmail(res.headers.get("anthropic-organization-id") ?? "", requestId)) return;
    console.error("[ai account] 🔴 the out-of-credit alert did not send");
  } catch (err) {
    console.error("[ai account] 🔴 could not send the out-of-credit alert:", err);
  }
  // Not sent, so the next failure must be free to try again.
  if (claimed) await runInControlStore(() => writeJson(ALERT_FILE, { at: 0 })).catch((err) => console.error("[ai account] could not release the alert:", err));
}

const watchedFetch: NonNullable<ClientOptions["fetch"]> = async (url, init) => {
  const res = await fetch(url, init);
  if (res.status === 400 || res.status === 402) {
    const body = await res.clone().text();
    // After the response: a slow store or mail server must not hold up the error, or a refund behind it.
    if (/credit balance/i.test(body)) await afterResponse(() => alertOutOfCredit(res, body));
  }
  return res;
};

/** Every AI call goes through this, so a new feature is covered by the alert without remembering to. */
export function aiClient(options: ClientOptions): Anthropic {
  return new Anthropic({ ...options, fetch: watchedFetch });
}

/** In the reader's language: the portal's AI account is empty, not their school's credits. */
export async function aiOutOfCreditMessage(): Promise<string> {
  return (await getT())(MESSAGE);
}

/** The response for a route's catch, or null when the error is something else. */
export async function aiOutOfCreditResponse(err: unknown): Promise<NextResponse | null> {
  if (!isAiOutOfCredit(err)) return null;
  console.error("[ai account] out of credit:", err instanceof Error ? err.message : err);
  return NextResponse.json({ error: await aiOutOfCreditMessage(), code: "out-of-ai-credit" }, { status: 503 });
}
