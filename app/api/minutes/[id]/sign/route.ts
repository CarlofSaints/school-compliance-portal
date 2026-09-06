import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getMinutes, updateMinutes, saveSignatureImage } from "@/lib/minutesData";
import { signingProgress, formatPeriod } from "@/lib/minutes";
import {
  signingCodeMatches,
  documentHash,
  shortHash,
  decodeSignature,
  SignatureError,
} from "@/lib/minutesSigning";
import { resolveAudience, audienceForBody } from "@/lib/minutesRecipients";
import { sendMinutesSignedEmail } from "@/lib/email";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom, clientIp } from "@/lib/activityActor";

const SEND_GAP_MS = 600;
const pause = () => new Promise((r) => setTimeout(r, SEND_GAP_MS));

/**
 * Signs the minutes.
 *
 * 🔴 Not gated on a permission. The people who sign minutes are the Chair and
 * the Principal, and neither necessarily administers the portal. The gate is
 * being on the frozen signatory list AND holding the code that was emailed to
 * that address.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const record = await getMinutes(id);
  if (!record) {
    return NextResponse.json({ error: "Minutes not found" }, { status: 404 });
  }

  if (record.status !== "awaiting_signatures") {
    return NextResponse.json(
      {
        error:
          record.status === "signed"
            ? "These minutes have already been signed by everyone."
            : "These minutes are not out for signing yet.",
      },
      { status: 409 }
    );
  }

  const me = session.email.trim().toLowerCase();
  const index = record.signatories.findIndex((s) => s.email.trim().toLowerCase() === me);
  if (index === -1) {
    return NextResponse.json(
      {
        error:
          "You are not on the signing list for these minutes. Ask the secretary to add you if you should be.",
      },
      { status: 403 }
    );
  }

  const signatory = record.signatories[index];
  if (signatory.signedAt) {
    return NextResponse.json(
      { error: "You have already signed these minutes." },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code : "";

  // Decoded FIRST, before the code is checked and spent. A mark that cannot
  // be read must not consume the one-time code and leave somebody holding a
  // dead code and an unsigned document.
  let mark;
  try {
    mark = decodeSignature(typeof body.signature === "string" ? body.signature : "");
  } catch (e) {
    if (e instanceof SignatureError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
  if (!signingCodeMatches(code, id, signatory.codeHash)) {
    // Logged, because repeated wrong codes against a governance record are
    // worth seeing in the audit trail even when each one is an honest typo.
    await recordActivity({
      ...actorFrom(req, session),
      action: "minutes.sign_failed",
      entity: "minutes",
      entityId: id,
      summary: `Wrong signing code entered for "${record.title}"`,
    });
    return NextResponse.json(
      {
        error:
          "That code does not match. Check the email you were sent, or ask the secretary to send it again.",
      },
      { status: 400 }
    );
  }

  // 🔴 What they signed, recorded at the moment they signed it. Without this a
  // signature is only a claim that somebody clicked; with it, a later copy of
  // the minutes can be checked against what was actually agreed.
  const hash = documentHash(record);

  // Stored BEFORE the record says they signed. The other order leaves a
  // record claiming a signature with no image behind it, which renders as an
  // empty signature block and reads like a forgery rather than a failed save.
  await saveSignatureImage(id, signatory.email, mark.png);

  const signatories = [...record.signatories];
  signatories[index] = {
    ...signatory,
    signedAt: new Date().toISOString(),
    documentHash: hash,
    ip: clientIp(req),
    signature: {
      kind: body.kind === "typed" ? "typed" : "drawn",
      width: mark.width,
      height: mark.height,
    },
    // The code is spent. Keeping the hash would let the same code sign again if
    // the minutes were ever reopened.
    codeHash: undefined,
  };

  const progress = signingProgress(signatories);
  const updated = await updateMinutes(id, {
    signatories,
    status: progress.complete ? "signed" : "awaiting_signatures",
    signedAt: progress.complete ? new Date().toISOString() : undefined,
  });

  await recordActivity({
    ...actorFrom(req, session),
    action: "minutes.signed",
    entity: "minutes",
    entityId: id,
    summary: `Signed "${record.title}" (${progress.signed} of ${progress.total})`,
    detail: { documentHash: hash, complete: progress.complete },
  });

  // Everybody has signed, so the whole governing body gets the final record.
  if (progress.complete) {
    const audience = await resolveAudience(audienceForBody(record.body));
    const signedBy = signatories.map((s) => s.name);
    for (const person of [...audience.to, ...audience.cc]) {
      await sendMinutesSignedEmail(
        person.email,
        person.name,
        id,
        record.title,
        formatPeriod(record.period),
        signedBy,
        shortHash(hash)
      );
      await pause();
    }
    await recordActivity({
      ...actorFrom(req, session),
      action: "minutes.distributed",
      entity: "minutes",
      entityId: id,
      summary: `Sent the signed "${record.title}" to ${audience.to.length + audience.cc.length} people`,
      detail: {
        to: audience.to.map((r) => r.email),
        cc: audience.cc.map((r) => r.email),
        withoutEmail: audience.withoutEmail,
      },
    });
  }

  return NextResponse.json({ record: updated, progress });
}
