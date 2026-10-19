import { writeJson, writeFile, readFile, listFilesStrict, readJson, readJsonTolerant } from "./controlData";
import { activityMonths } from "./activityLog";

// ---------------------------------------------------------------------------
// The SENT BOX: every email the portal sends, as it was sent (Carl, 19 Oct
// 2026: "so admins can see exactly what emails have been sent").
//
// Per email, two blobs with the same name:
//   sent-emails/<YYYY-MM>/<at>-<id>.json       the summary the list reads
//   sent-email-bodies/<YYYY-MM>/<at>-<id>.html  the body, read when opened
// One file per email (the activity log's pattern), so two sends at once
// never fight over one file, and a list never drags every body along.
//
// 🔴 Never a second way to read what the reader may not: anything tied to
// minutes carries minutesId and the list hides it from someone who cannot
// read those minutes. Personal mail (weekly update, action summary, action
// chases not tied to minutes) is kept with NEITHER its subject nor its body.
//
// 🔴 Never a way to act as someone else: signing codes, temporary passwords
// and every token in a link are blanked before anything is stored.
// ---------------------------------------------------------------------------

export interface EmailMeta {
  /** What it was, e.g. "minutes.signing_code", "spend.approval_request". */
  kind: string;
  /** The minutes it is about, for the read-access rule. */
  minutesId?: string;
  /** Exact strings to blank (a signing code, a temporary password). */
  secrets?: string[];
  /** Built for one reader from things only they may see: subject and body not kept. */
  personal?: boolean;
}

export interface SentEmail {
  id: string;
  at: string;
  to: string;
  /** Empty for personal mail. */
  subject: string;
  kind: string;
  minutesId?: string;
  /** Accepted by the email service (not proof of delivery). */
  ok: boolean;
  /** Why not, in the service's words, when it refused or failed. */
  error?: string;
  attachments?: string[];
  /** A body was kept (not for personal mail). */
  hasBody: boolean;
}

const BLANK = "••••••";

/** Blanks every secret before anything is stored. */
export function redactEmailHtml(html: string, secrets: string[] = []): string {
  let out = html;
  // As typed AND as the template escaped it: a password "Tom&Jerry1" sits in
  // the HTML as "Tom&amp;Jerry1".
  const escaped = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  for (const s of secrets.filter((x) => x && x.length >= 3)) {
    out = out.split(escaped(s)).join(BLANK).split(s).join(BLANK);
  }
  return out
    // ?token=… / &token=… / &amp;token=… / &code=… in any link
    .replace(/([?&](?:amp;)?(?:token|code|t)=)[^"'&<\s]+/gi, `$1${BLANK}`)
    // /bookings/request/<token>
    .replace(/(\/bookings\/request\/)[^"'<\s]+/g, `$1${BLANK}`);
}

function names(at: string, id: string) {
  const month = at.slice(0, 7);
  const base = `${at}-${id.slice(0, 8)}`;
  return { summary: `sent-emails/${month}/${base}.json`, body: `sent-email-bodies/${month}/${base}.html` };
}

/** Never throws: a sent box that cannot be written must not fail a send. */
export async function recordSentEmail(
  e: Omit<SentEmail, "id" | "at" | "hasBody">,
  html: string | undefined,
  secrets: string[] = []
): Promise<void> {
  try {
    const at = new Date().toISOString();
    const id = crypto.randomUUID();
    const files = names(at, id);
    const entry: SentEmail = { ...e, id, at, subject: redactEmailHtml(e.subject, secrets), hasBody: html !== undefined };
    // Body first: a summary must never point at a body that is not there.
    if (html !== undefined) await writeFile(files.body, Buffer.from(redactEmailHtml(html, secrets), "utf8"));
    await writeJson(files.summary, entry);
  } catch (err) {
    console.error("[sent emails] Could not record:", e.kind, err);
  }
}

/** Months that have mail, newest first. */
export async function sentEmailMonths(): Promise<string[]> {
  return activityMonths(["sent-emails"]);
}

export const SENT_PAGE_SIZE = 200;

/** A page of a month's mail, newest first. A storage error THROWS: an outage
 *  must not read as "nothing sent". total says how many the month holds. */
export async function readSentEmails(month: string, page = 0): Promise<{ emails: SentEmail[]; total: number }> {
  if (!/^\d{4}-\d{2}$/.test(month)) return { emails: [], total: 0 };
  const all = (await listFilesStrict(`sent-emails/${month}`)).filter((n) => n.endsWith(".json")).sort().reverse();
  const slice = all.slice(page * SENT_PAGE_SIZE, (page + 1) * SENT_PAGE_SIZE);
  const read = await Promise.all(slice.map((n) => readJsonTolerant<SentEmail | null>(`sent-emails/${month}/${n}`, null)));
  return { emails: read.filter((e): e is SentEmail => !!e), total: all.length };
}

/** One email and its body, found directly from when it was sent and its id. */
export async function readSentEmail(at: string, id: string): Promise<{ email: SentEmail; html?: string } | null> {
  if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(at) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const files = names(at, id);
  const email = await readJson<SentEmail | null>(files.summary, null);
  if (!email || email.id !== id) return null;
  const body = email.hasBody ? await readFile(files.body) : null;
  return { email, html: body ? body.toString("utf8") : undefined };
}
