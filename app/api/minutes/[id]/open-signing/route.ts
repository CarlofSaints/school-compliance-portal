import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requireAnyPermission } from "@/lib/rolesData";
import { getMinutes } from "@/lib/minutesData";
import { canOpenSigning, MINUTES_STATUS_LABELS } from "@/lib/minutes";
import { openSigning, SigningSetupError } from "@/lib/minutesSigningFlow";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

const CAN_MANAGE = ["manage_minutes", "manage_users"];

/**
 * Opens signing, or sends one signatory their code again.
 *
 * Two callers with different rights, which is why the permission check happens
 * after reading the body rather than at the top:
 *
 *  - the secretary opens signing (needs manage_minutes)
 *  - a signatory asks for their own code again (needs only to be that person,
 *    because the alternative is the secretary having to be available before
 *    anybody who lost an email can sign)
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

  const body = await req.json().catch(() => ({}));
  const resendMine = body.resendMine === true;

  if (resendMine) {
    if (record.status !== "awaiting_signatures") {
      return NextResponse.json(
        { error: "These minutes are not out for signing, so there is no code to send." },
        { status: 409 }
      );
    }
    const me = session.email.trim().toLowerCase();
    const mine = record.signatories.find((s) => s.email.trim().toLowerCase() === me);
    if (!mine) {
      return NextResponse.json(
        { error: "You are not on the signing list for these minutes." },
        { status: 403 }
      );
    }
    if (mine.signedAt) {
      return NextResponse.json(
        { error: "You have already signed these minutes, so there is nothing to send." },
        { status: 409 }
      );
    }
    // 🔴 Only this address. Re-minting everybody's code would invalidate the
    // ones already sitting in the other signatories' inboxes, and they would
    // discover it only when their code stopped working.
    const result = await openSigning(id, [session.email]);
    await recordActivity({
      ...actorFrom(req, session),
      action: "minutes.signing_code_resent",
      entity: "minutes",
      entityId: id,
      summary: `Sent themselves a new signing code for "${record.title}"`,
    });
    return NextResponse.json({ record: result.record, sent: result.sent, failed: result.failed });
  }

  const managing = await requireAnyPermission(req, CAN_MANAGE);
  if (managing instanceof NextResponse) return managing;

  if (!canOpenSigning(record.status)) {
    return NextResponse.json(
      {
        error:
          record.status === "awaiting_signatures"
            ? "These minutes are already out for signing. A signatory who lost their code can ask for a new one."
            : `These minutes are ${MINUTES_STATUS_LABELS[record.status].toLowerCase()} and cannot be sent for signing.`,
      },
      { status: 409 }
    );
  }

  try {
    const result = await openSigning(id);
    await recordActivity({
      ...actorFrom(req, session),
      action: "minutes.signing_opened",
      entity: "minutes",
      entityId: id,
      summary: `Sent "${record.title}" out for signing to ${result.record.signatories
        .map((s) => s.name)
        .join(", ")}`,
      detail: {
        fromStatus: record.status,
        failed: result.failed,
        withoutEmail: result.withoutEmail,
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof SigningSetupError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
