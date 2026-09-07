import { recordDistribution } from "./minutesData";
import type { MinutesRecord, MinutesDistributionNote } from "./minutesData";
import { formatPeriod, canDistribute } from "./minutes";
import { resolveAudience, audienceForBody, AUDIENCE_LABELS } from "./minutesRecipients";
import { documentHash, shortHash } from "./minutesSigning";
import { sendMinutesSignedEmail } from "./email";

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
  /** Which audience was used, so the caller can say "the SGB list" out loud
   *  rather than reporting an anonymous number. */
  audienceLabel: string;
}

/** Who a set of minutes would go to, resolved but not sent. Lets the page name
 *  the list before anybody clicks, and say what is not configured. */
export async function previewDistribution(record: MinutesRecord) {
  const audience = audienceForBody(record.body);
  const resolved = await resolveAudience(audience);
  return {
    audience,
    audienceLabel: AUDIENCE_LABELS[audience],
    to: resolved.to,
    cc: resolved.cc,
    withoutEmail: resolved.withoutEmail,
    empty: resolved.empty,
  };
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
  if (preview.empty) {
    throw new DistributionError(
      `Nobody is set up to receive ${preview.audienceLabel.toLowerCase()}. Set that tag under Admin, Minutes Admin, and try again.`
    );
  }

  // 🔴 The hash of the minutes AS THEY STAND, computed here rather than read
  // off a signatory. A wet-ink record has no signatory row to read it from,
  // and a signed record cannot have changed since, so the two agree.
  const ref = shortHash(documentHash(record));
  const signedBy = record.signatories.filter((s) => s.signedAt).map((s) => s.name);
  const period = formatPeriod(record.period);

  const failed: string[] = [];
  let sent = 0;
  for (const person of [...preview.to, ...preview.cc]) {
    const ok = await sendMinutesSignedEmail(
      person.email,
      person.name,
      id,
      record.title,
      period,
      signedBy,
      ref
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
  };
  await recordDistribution(record, note);

  return {
    sent,
    failed,
    to: preview.to.map((r) => r.email),
    cc: preview.cc.map((r) => r.email),
    withoutEmail: preview.withoutEmail,
    audienceLabel: preview.audienceLabel,
  };
}
