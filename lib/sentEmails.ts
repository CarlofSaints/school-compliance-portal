import { writeJson, listFiles, listFolders, readJsonTolerant } from "./controlData";

// ---------------------------------------------------------------------------
// The SENT BOX: every email the portal sends, as it was sent (Carl, 19 Oct
// 2026: "so admins can see exactly what emails have been sent").
//
// One blob per email (sent-emails/<YYYY-MM>/<at>-<id>.json), the activity
// log's pattern: two sends at once never fight over one file.
//
// 🔴 Never a second way to read what the reader may not: anything tied to
// minutes carries minutesId and the list hides it from someone who cannot
// read those minutes. Personal digests (weekly update, action summary,
// action chases not tied to minutes) are kept WITHOUT their body.
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
  /** Built for one reader from things only they may see: body not kept. */
  personal?: boolean;
}

export interface SentEmail {
  id: string;
  at: string;
  to: string;
  subject: string;
  kind: string;
  minutesId?: string;
  /** Accepted by the email service (not proof of delivery). */
  ok: boolean;
  /** Why not, in the service's words, when it refused or failed. */
  error?: string;
  attachments?: string[];
  /** As sent, secrets blanked. Absent for personal mail. */
  html?: string;
}

const BLANK = "••••••";

/** Blanks every secret before anything is stored. */
export function redactEmailHtml(html: string, secrets: string[] = []): string {
  let out = html;
  for (const s of secrets.filter((x) => x && x.length >= 3)) out = out.split(s).join(BLANK);
  return out
    // ?token=… / &token=… / &code=… in any link
    .replace(/([?&](?:token|code|t)=)[^"'&<\s]+/gi, `$1${BLANK}`)
    // /bookings/request/<token>
    .replace(/(\/bookings\/request\/)[^"'<\s]+/g, `$1${BLANK}`);
}

/** Never throws: a sent box that cannot be written must not fail a send. */
export async function recordSentEmail(e: Omit<SentEmail, "id" | "at">, secrets: string[] = []): Promise<void> {
  try {
    const at = new Date().toISOString();
    const id = crypto.randomUUID();
    const entry: SentEmail = {
      ...e,
      id,
      at,
      subject: redactEmailHtml(e.subject, secrets),
      ...(e.html !== undefined ? { html: redactEmailHtml(e.html, secrets) } : {}),
    };
    await writeJson(`sent-emails/${at.slice(0, 7)}/${at}-${id.slice(0, 6)}.json`, entry);
  } catch (err) {
    console.error("[sent emails] Could not record:", e.kind, err);
  }
}

/** Months that have mail, newest first. */
export async function sentEmailMonths(): Promise<string[]> {
  return (await listFolders("sent-emails")).filter((m) => /^\d{4}-\d{2}$/.test(m)).sort().reverse();
}

/** A month's mail, newest first, capped (a busy school sends a few hundred). */
export async function readSentEmails(month: string, limit = 500): Promise<SentEmail[]> {
  if (!/^\d{4}-\d{2}$/.test(month)) return [];
  const names = (await listFiles(`sent-emails/${month}`)).sort().reverse().slice(0, limit);
  const all = await Promise.all(names.map((n) => readJsonTolerant<SentEmail | null>(`sent-emails/${month}/${n}`, null)));
  return all.filter((e): e is SentEmail => !!e);
}
