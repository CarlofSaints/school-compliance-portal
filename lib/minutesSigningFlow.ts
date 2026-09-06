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
  const existing = new Map(
    record.signatories.map((s) => [s.email.trim().toLowerCase(), s] as const)
  );

  const codes: { signatory: Signatory; code: string }[] = [];
  const signatories: Signatory[] = audience.to.map((r) => {
    const prior = existing.get(r.email);

    // 🔴 Never re-issue a code to somebody who has already signed. Their
    // signature is bound to the document as it was; handing them a new code
    // would invite them to sign the same minutes twice and would suggest the
    // first signature no longer counted.
    if (prior?.signedAt) return prior;

    // A targeted resend leaves everybody else exactly as they were.
    if (wanted && !wanted.includes(r.email)) {
      return prior ?? blank(r.email, r.name, byEmail);
    }

    const code = mintSigningCode();
    const person = byEmail.get(r.email);
    const signatory: Signatory = {
      personId: person?.id ?? prior?.personId ?? "",
      name: r.name,
      email: r.email,
      role: signatoryRoleForPosition(person?.position),
      codeHash: hashSigningCode(code, id),
      codeSentAt: new Date().toISOString(),
    };
    codes.push({ signatory, code });
    return signatory;
  });

  const updated = await updateMinutes(id, {
    signatories,
    status: "awaiting_signatures",
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

/** A signatory we know of but have not issued a code to on this pass. */
function blank(
  email: string,
  name: string,
  byEmail: Map<string, { id: string; position?: string }>
): Signatory {
  const person = byEmail.get(email);
  return {
    personId: person?.id ?? "",
    name,
    email,
    role: signatoryRoleForPosition(person?.position),
  };
}
