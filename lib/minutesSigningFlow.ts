import { getMinutes, updateMinutes } from "./minutesData";
import type { MinutesRecord } from "./minutesData";
import type { Signatory } from "./minutes";
import { formatPeriod } from "./minutes";
import { signatoryRoleForPosition } from "./positions";
import { resolveAudience } from "./minutesRecipients";
import { getPeople } from "./peopleData";
import { mintSigningCode, hashSigningCode } from "./minutesSigning";
import { sendMinutesSigningCodeEmail } from "./email";

// ---------------------------------------------------------------------------
// Opening signing: freeze who signs, mint each of them a code, send it.
//
// Shared, because it happens two ways. Normally the last approval in the review
// round opens signing automatically. But a school that does not circulate a
// draft at all should not be forced through a review round it does not want, so
// the secretary can also open signing directly.
// ---------------------------------------------------------------------------

// Resend takes about two a second. Same gap as lib/actionItemNotify.ts.
const SEND_GAP_MS = 600;
const pause = () => new Promise((r) => setTimeout(r, SEND_GAP_MS));

export interface OpenSigningResult {
  record: MinutesRecord;
  sent: number;
  failed: string[];
  /** On the signing list with no address. Named, never silently dropped: a
   *  signatory who is never emailed holds the minutes open forever and nobody
   *  can see why. */
  withoutEmail: string[];
}

export class SigningSetupError extends Error {}

/**
 * @param only  Resend to just these addresses, leaving everybody else's code
 *              alone. A fresh code for everyone would invalidate the code the
 *              other signatories already have sitting in their inbox.
 */
export async function openSigning(
  id: string,
  only?: string[]
): Promise<OpenSigningResult> {
  const record = await getMinutes(id);
  if (!record) throw new SigningSetupError("Minutes not found.");

  const audience = await resolveAudience("signing");
  if (audience.empty) {
    throw new SigningSetupError(
      'Nobody is set up to sign minutes. Set the tag for "Ready to sign" under Admin, Minutes Admin, and try again.'
    );
  }

  // Position decides the capacity somebody signs in, and it lives on the People
  // register rather than on the user account.
  const people = await getPeople();
  const byEmail = new Map(
    people
      .filter((p) => p.email)
      .map((p) => [p.email!.trim().toLowerCase(), p] as const)
  );

  const wanted = only?.map((e) => e.trim().toLowerCase());

  // Codes are minted ONCE per address, outside the save, so the code stored is
  // the code emailed even if the save has to be redone on a fresher copy.
  const minted = new Map<string, string>();
  const codeFor = (email: string) => {
    if (!minted.has(email)) minted.set(email, mintSigningCode());
    return minted.get(email)!;
  };
  const issue = (email: string, name: string, prior?: Signatory): Signatory => {
    const person = byEmail.get(email);
    return {
      personId: person?.id ?? prior?.personId ?? "",
      name,
      email,
      role: signatoryRoleForPosition(person?.position),
      codeHash: hashSigningCode(codeFor(email), id),
      codeSentAt: new Date().toISOString(),
    };
  };

  // 🔴 Worked out from the signatories AS THEY ARE AT SAVE TIME. Before, this
  // rebuilt the list from an earlier read, so a code re-sent while somebody
  // else was signing could erase that signature.
  let codes: { signatory: Signatory; code: string }[] = [];
  const updated = await updateMinutes(id, (current) => {
    codes = [];
    const existing = new Map(
      current.signatories.map((s) => [s.email.trim().toLowerCase(), s] as const)
    );

    // A targeted RESEND changes only the people asked for, on the list as it
    // stands. It no longer rebuilds the list from today's "Ready to sign" tag:
    // the people signing were fixed when signing opened, and somebody added to
    // the tag since is not a signatory of these minutes.
    if (wanted) {
      const signatories = current.signatories.map((prior) => {
        const email = prior.email.trim().toLowerCase();
        // 🔴 Never re-issue a code to somebody who has already signed.
        if (prior.signedAt || !wanted.includes(email)) return prior;
        const signatory = issue(email, prior.name, prior);
        codes.push({ signatory, code: codeFor(email) });
        return signatory;
      });
      return { signatories, status: "awaiting_signatures" as const };
    }

    // OPENING signing: the list comes from the "Ready to sign" tag.
    const signatories: Signatory[] = audience.to.map((r) => {
      const prior = existing.get(r.email);
      // 🔴 Never re-issue a code to somebody who has already signed. Their
      // signature is bound to the document as it was; handing them a new code
      // would invite them to sign the same minutes twice and would suggest the
      // first signature no longer counted.
      if (prior?.signedAt) return prior;
      const signatory = issue(r.email, r.name, prior);
      codes.push({ signatory, code: codeFor(r.email) });
      return signatory;
    });
    return { signatories, status: "awaiting_signatures" as const };
  });

  const periodLabel = formatPeriod(record.period);
  const failed: string[] = [];
  for (const { signatory, code } of codes) {
    const ok = await sendMinutesSigningCodeEmail(
      signatory.email,
      signatory.name,
      id,
      record.title,
      periodLabel,
      code
    );
    if (!ok) failed.push(signatory.email);
    await pause();
  }

  return {
    record: updated ?? record,
    sent: codes.length - failed.length,
    failed,
    withoutEmail: audience.withoutEmail,
  };
}
