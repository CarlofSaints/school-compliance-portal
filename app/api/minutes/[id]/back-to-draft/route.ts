import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { sessionMayReadMinutes } from "@/lib/minutesAccess";
import { getMinutes, updateMinutes, MinutesLockedError } from "@/lib/minutesData";
import { minutesForClient } from "@/lib/minutesSigning";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

const CAN_MANAGE = ["manage_minutes", "manage_users"];

class NotOutForSigning extends Error {}
class SignedSinceAsked extends Error {}

/**
 * Takes minutes that are out for signing back to Draft, so the words can be
 * edited and signing opened again. Carl, 14 Nov 2026.
 *
 * 🔴 Every signatory is dropped, so every code already emailed stops working.
 * Anyone who already signed loses that signature: they signed words that are
 * about to change. That only happens when the caller says so
 * (`discardSignatures`), after the page has named those people.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAnyPermission(req, CAN_MANAGE);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const record = await getMinutes(id);
  if (!record || !(await sessionMayReadMinutes(session, record))) {
    return NextResponse.json({ error: "Minutes not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const discard = body.discardSignatures === true;

  let dropped: string[] = [];
  try {
    const updated = await updateMinutes(id, (current) => {
      if (current.status !== "awaiting_signatures") throw new NotOutForSigning();
      dropped = current.signatories.filter((s) => s.signedAt).map((s) => s.name);
      // Checked on the copy being saved: somebody may have signed after the
      // page loaded, and their signature must not go without being named.
      if (dropped.length && !discard) throw new SignedSinceAsked();
      return { status: "draft" as const, signatories: [] };
    });
    await recordActivity({
      ...actorFrom(req, session),
      action: "minutes.signing_withdrawn",
      entity: "minutes",
      entityId: id,
      summary: dropped.length
        ? `Took "${record.title}" back to draft, removing the signatures of ${dropped.join(", ")}`
        : `Took "${record.title}" back to draft before anyone signed`,
      detail: { droppedSignatures: dropped },
    });
    return NextResponse.json({ record: minutesForClient(updated ?? record), dropped });
  } catch (e) {
    if (e instanceof NotOutForSigning) {
      return NextResponse.json({ error: "These minutes are not out for signing." }, { status: 409 });
    }
    if (e instanceof MinutesLockedError) {
      return NextResponse.json({ error: "Everyone has signed these minutes, so they are closed and cannot go back to draft." }, { status: 409 });
    }
    if (e instanceof SignedSinceAsked) {
      return NextResponse.json(
        { error: `${dropped.join(", ")} has signed since this page loaded. Reload, check, and try again.` },
        { status: 409 }
      );
    }
    throw e;
  }
}
