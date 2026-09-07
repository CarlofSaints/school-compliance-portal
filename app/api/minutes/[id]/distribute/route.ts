import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { getMinutes } from "@/lib/minutesData";
import {
  distributeSignedMinutes,
  previewDistribution,
  DistributionError,
} from "@/lib/minutesDistribution";
import { canDistribute } from "@/lib/minutes";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

const CAN_MANAGE = ["manage_minutes", "manage_users"];

/**
 * Who a signed set of minutes would go to, without sending anything.
 *
 * The page names the list before anybody clicks. "Send to 23 people" with no
 * way to see who they are is the kind of button a secretary does not press.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAnyPermission(req, CAN_MANAGE);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const record = await getMinutes(id);
  if (!record) {
    return NextResponse.json({ error: "Minutes not found" }, { status: 404 });
  }

  const preview = await previewDistribution(record);
  return NextResponse.json(
    {
      audienceLabel: preview.audienceLabel,
      to: preview.to,
      cc: preview.cc,
      withoutEmail: preview.withoutEmail,
      empty: preview.empty,
      // Whether the button should be offered at all, through the one shared
      // rule - a wet-ink upload closes minutes without the status ever
      // reaching "signed".
      closed: canDistribute(record.status, !!record.signedCopy),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * Sends the signed minutes to the whole governing body, on demand.
 *
 * Carl asked for this as a button of its own even though the last signature
 * already triggers it. Two reasons it is not redundant:
 *
 *   1. 🔴 Minutes signed on PAPER never pass through the signing route, so
 *      before this they were distributed to nobody at all.
 *   2. A send that failed - an unconfigured tag, an email outage - previously
 *      had no second chance without re-signing minutes that cannot be
 *      re-signed, because signing locks them.
 *
 * Gated on managing minutes: distribution is a secretarial act, unlike
 * SIGNING, which is deliberately open to whoever is on the frozen list.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAnyPermission(req, CAN_MANAGE);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const record = await getMinutes(id);
  if (!record) {
    return NextResponse.json({ error: "Minutes not found" }, { status: 404 });
  }

  try {
    const result = await distributeSignedMinutes(record, {
      name: `${session.name} ${session.surname}`.trim(),
    });

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
        trigger: "sent by hand",
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof DistributionError) {
      // The message names the setting to fix rather than saying "failed",
      // the same way opening signing does.
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[minutes] distribute failed:", err);
    return NextResponse.json(
      { error: "Could not send those minutes" },
      { status: 500 }
    );
  }
}
