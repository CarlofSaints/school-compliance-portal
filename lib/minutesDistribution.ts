import { recordDistribution, readSignedCopy } from "./minutesData";
import type { MinutesRecord, MinutesDistributionNote } from "./minutesData";
import { canDistribute, formatPeriod, meetingWhen } from "./minutes";
import { getActionItems } from "./actionItemData";
import { isClosed, type ActionItem } from "./actionItems";
import { getPeople } from "./peopleData";
import { getUsers } from "./userData";
import { documentHash, shortHash } from "./minutesSigning";
import { resolveAudience, audienceForBody, AUDIENCE_LABELS } from "./minutesRecipients";
import { loadMinutesAccessContext, loadRecipientResolver, viewerMayRead } from "./minutesAccess";
import { sendMinutesSignedEmail, type EmailAttachment, type SignedEmailAction } from "./email";
import { buildMinutesDocxFile, minutesDocxFilename } from "./minutesDocxFile";

/**
 * The file that travels with the signed minutes.
 *
 * Carl: attach the Word document, so a governor can read the minutes without
 * signing in. Several people on a distribution tag are on the People register
 * with no login at all, and a link to the portal is useless to them.
 *
 * 🔴 Minutes closed on PAPER send the signed SCAN, not a Word file. A Word copy
 * of those minutes has empty signature lines, and a governor holding it would
 * reasonably conclude nobody had signed. The scan is the signed record.
 *
 * Built ONCE per send, not per recipient, and never fatal: minutes that cannot
 * be attached still go out with their link, because not sending the final
 * record at all is worse than sending it without a copy.
 */
async function signedMinutesAttachment(
  record: MinutesRecord
): Promise<EmailAttachment | null> {
  try {
    if (record.signedCopy) {
      const scan = await readSignedCopy(record.id);
      if (scan) return { filename: record.signedCopy.filename, content: scan };
    }
    const docx = await buildMinutesDocxFile(record);
    return { filename: minutesDocxFilename(record), content: docx };
  } catch (err) {
    console.error("[minutes distribution] Could not build the attachment:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sending a fully signed set of minutes to the whole governing body.
//
// Shared, because it happens two ways and the two must not drift:
//
//   1. Automatically, when the last signature lands (api/minutes/[id]/sign).
//   2. On demand, from the button on the minutes page.
//
// 🔴 (2) is not a convenience. A school that signs on PAPER closes its minutes
// by uploading the scan, which never passes through the signing route, so
// before this the traditional route distributed to nobody at all. The button is
// the only way those minutes ever reach the SGB.
// ---------------------------------------------------------------------------

// Resend takes about two a second. Same gap as lib/minutesSigningFlow.ts.
const SEND_GAP_MS = 600;
const pause = () => new Promise((r) => setTimeout(r, SEND_GAP_MS));

export class DistributionError extends Error {}

export interface DistributionResult {
  sent: number;
  failed: string[];
  to: string[];
  cc: string[];
  /** On the distribution tag with no address. Named, never silently dropped:
   *  a governor who is meant to receive the minutes and quietly does not is
   *  exactly the gap the register exists to close. */
  withoutEmail: string[];
  /** On the list but not allowed to read this kind of minutes, so not sent. */
  heldBack: string[];
  /** Which audience was used, so the caller can say "the SGB list" out loud
   *  rather than reporting an anonymous number. */
  audienceLabel: string;
}

/** Who a set of minutes would go to, resolved but not sent. Lets the page name
 *  the list before anybody clicks, and say what is not configured. */
export async function previewDistribution(record: MinutesRecord) {
  const audience = audienceForBody(record.body);
  const resolved = await resolveAudience(audience);

  // 🔴 Nobody is sent minutes they may not read. "Other" goes to the SGB list,
  // so a set limited to a disciplinary panel would otherwise land in the whole
  // SGB's inbox with the document attached. Those held back are NAMED, so the
  // secretary sees who is on the list but outside the read setting.
  const ctx = await loadMinutesAccessContext();
  const resolver = await loadRecipientResolver(ctx);
  const allowed = (r: { email: string }) => viewerMayRead(record, resolver.forEmail(r.email).viewer, ctx);
  const to = resolved.to.filter(allowed);
  const cc = resolved.cc.filter(allowed);
  const heldBack = [...resolved.to, ...resolved.cc].filter((r) => !allowed(r)).map((r) => r.name);

  return {
    audience,
    audienceLabel: AUDIENCE_LABELS[audience],
    to,
    cc,
    withoutEmail: resolved.withoutEmail,
    heldBack,
    // Unchanged meaning: nobody on the To list means do not send.
    empty: to.length === 0,
  };
}

/**
 * Lowercased email -> that person's open actions raised from these minutes.
 * Filed under BOTH of an assignee's addresses (their linked login's and their
 * People record's), because the list may mail either. Each action is listed
 * once per address, even if two register entries share that address.
 */
export function openActionsByEmail(
  minutesId: string,
  items: Pick<ActionItem, "id" | "title" | "dueDate" | "status" | "assigneeIds" | "fromMinutes">[],
  people: { id: string; email?: string; userId?: string | null }[],
  users: { id: string; email?: string }[]
): Map<string, SignedEmailAction[]> {
  const norm = (e?: string) => (e || "").trim().toLowerCase();
  const userEmail = new Map(users.map((u) => [u.id, norm(u.email)]));
  // Both of a person's addresses: the distribution list may mail either the
  // register's or the login's, and the lookup must find them under each.
  const emailsOf = new Map(
    people.map((p) => [p.id, [...new Set([p.userId ? userEmail.get(p.userId) : "", norm(p.email)].filter((e): e is string => !!e))]])
  );
  const out = new Map<string, SignedEmailAction[]>();
  const listed = new Set<string>();
  for (const item of items) {
    // Cancelled counts as closed too: neither is anybody's to execute.
    if (item.fromMinutes?.minutesId !== minutesId || isClosed(item)) continue;
    for (const pid of item.assigneeIds) {
      for (const email of emailsOf.get(pid) ?? []) {
        if (listed.has(`${email}|${item.id}`)) continue;
        listed.add(`${email}|${item.id}`);
        const list = out.get(email) ?? [];
        list.push({ title: item.title, dueDate: item.dueDate || undefined });
        out.set(email, list);
      }
    }
  }
  return out;
}

/**
 * Emails the signed minutes to the distribution list for that body.
 *
 * The audience is resolved at SEND time, never frozen: a governor elected
 * after the meeting should still receive the minutes of it. That is the
 * opposite rule to the REVIEW round, where the list is frozen so somebody
 * added tomorrow cannot un-complete a finished round - the difference is that
 * distribution is a copy and review is a decision.
 */
export async function distributeSignedMinutes(
  /**
   * 🔴 The RECORD, not an id. The final signature writes the record and then
   * distributes in the same request, and a blob overwrite takes a moment to
   * propagate - so re-reading here could hand back the copy from before the
   * signature landed. This would then refuse to send ("not signed yet") and,
   * worse, the delivery note would be appended to the stale copy and saved
   * over the signature. The caller passes in what it just wrote.
   */
  record: MinutesRecord,
  /** Who triggered it. Absent means the last signature did. */
  actor?: { name: string }
): Promise<DistributionResult> {
  const id = record.id;

  // Signed by everybody, or closed by a wet-ink upload. Anything else is a
  // draft, and a draft going out as final is the one mistake this module
  // exists to prevent.
  if (!canDistribute(record.status, !!record.signedCopy)) {
    throw new DistributionError(
      "These minutes are not signed yet. They can be sent to the governing body once signing is complete."
    );
  }

  const preview = await previewDistribution(record);
  if (preview.empty && preview.heldBack.length > 0) {
    throw new DistributionError(
      `Everyone on the ${preview.audienceLabel.toLowerCase()} list is outside who may read these minutes. Check Admin, Minutes Admin, Who can read minutes.`
    );
  }
  if (preview.empty) {
    throw new DistributionError(
      `Nobody is set up to receive ${preview.audienceLabel.toLowerCase()}. Set that tag under Admin, Minutes Admin, and try again.`
    );
  }

  // Each recipient's OPEN actions raised from these minutes, by email, and who
  // can sign in (only they are pointed at the Action Item List). A failure
  // here loses the list, never the minutes themselves.
  const actionLists = (async () => {
    try {
      const [items, people, users] = await Promise.all([getActionItems(), getPeople(), getUsers()]);
      return {
        byEmail: openActionsByEmail(id, items, people, users),
        // Any address of someone WITH a login: their login email, or the
        // register email of a People entry linked to one.
        logins: new Set(
          [...users.map((u) => u.email), ...people.filter((p) => p.userId && users.some((u) => u.id === p.userId)).map((p) => p.email)]
            .map((e) => (e || "").trim().toLowerCase())
            .filter(Boolean)
        ),
      };
    } catch (err) {
      console.error("[minutes distribution] Could not read action items, sending without them:", err);
      return { byEmail: new Map<string, SignedEmailAction[]>(), logins: new Set<string>() };
    }
  })();
  const signedBy = record.signatories.filter((s) => s.signedAt).map((s) => s.name);
  // The period only: the email's opening line already gives the date.
  const period = formatPeriod(record.period);

  // Built once for the whole list, alongside the action lists. Null means it
  // could not be built, and the minutes go out with their link regardless.
  const [attachment, { byEmail: actionsByEmail, logins }] = await Promise.all([
    signedMinutesAttachment(record),
    actionLists,
  ]);

  // 🔴 Computed from the minutes AS THEY STAND, once: a wet-ink (uploaded)
  // record has no signatory row to read it from, and a signed record cannot
  // have changed since, so the two agree.
  const documentRef = shortHash(documentHash(record));

  const failed: string[] = [];
  let sent = 0;
  for (const person of [...preview.to, ...preview.cc]) {
    const ok = await sendMinutesSignedEmail(
      person.email,
      person.name,
      id,
      record.title,
      period,
      meetingWhen(record.period, record.meetingDate),
      signedBy,
      documentRef,
      actionsByEmail.get(person.email.trim().toLowerCase()) ?? [],
      logins.has(person.email.trim().toLowerCase()),
      attachment
    );
    if (ok) sent += 1;
    else failed.push(person.email);
    await pause();
  }

  // Written whatever the outcome, INCLUDING a send where every address
  // failed. "We tried and nothing landed" is the reading a secretary needs;
  // recording only the successes would leave that looking like it never
  // happened at all.
  const note: MinutesDistributionNote = {
    at: new Date().toISOString(),
    by: actor?.name ?? "",
    trigger: actor ? "sent by hand" : "final signature",
    sent,
    recipients: preview.to.length + preview.cc.length,
    failed,
    // Recorded on the minutes, so an AUTOMATIC send (the last signature) still
    // shows the secretary who was on the list but outside the read setting.
    ...(preview.heldBack.length ? { heldBack: preview.heldBack } : {}),
  };
  await recordDistribution(record, note);

  return {
    sent,
    failed,
    to: preview.to.map((r) => r.email),
    cc: preview.cc.map((r) => r.email),
    withoutEmail: preview.withoutEmail,
    heldBack: preview.heldBack,
    audienceLabel: preview.audienceLabel,
  };
}
