import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getMinutes, updateMinutes, saveSignatureImage } from "@/lib/minutesData";
import { signingProgress } from "@/lib/minutes";
import {
  signingCodeMatches,
  documentHash,
  decodeSignature,
  SignatureError,
} from "@/lib/minutesSigning";
import { distributeSignedMinutes } from "@/lib/minutesDistribution";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom, clientIp } from "@/lib/activityActor";

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
  //
  // Through the shared helper, which is what the button on the minutes page
  // calls too. Two copies of "who receives the signed minutes" would drift,
  // and the copy that drifted would be the one nobody noticed.
  if (progress.complete && updated) {
    try {
      // `updated` is what updateMinutes just SAVED, passed straight through.
      // Re-reading the record here would race the write above.
      const result = await distributeSignedMinutes(updated);
      await recordActivity({
        ...actorFrom(req, session),
        action: "minutes.distributed",
        entity: "minutes",
        entityId: id,
        summary: `Sent the signed "${record.title}" to ${result.sent} people`,
        detail: {
          to: result.to,
          cc: result.cc,
          failed: result.failed,
          withoutEmail: result.withoutEmail,
          trigger: "final signature",
        },
      });
    } catch (err) {
      // 🔴 A distribution that cannot go out must NOT undo the signature. The
      // failure is recorded and left for the button on the minutes page, which
      // is exactly the situation that button is there for.
      await recordActivity({
        ...actorFrom(req, session),
        action: "minutes.distribution_failed",
        entity: "minutes",
        entityId: id,
        summary: `Could not send the signed "${record.title}" to the governing body`,
        detail: { reason: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  return NextResponse.json({ record: updated, progress });
}
