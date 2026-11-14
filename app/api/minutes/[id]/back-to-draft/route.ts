import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { sessionMayReadMinutes } from "@/lib/minutesAccess";
import { getMinutes, updateMinutes, MinutesChangeRefused, MinutesLockedError } from "@/lib/minutesData";
import { minutesForClient } from "@/lib/minutesSigning";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

const CAN_MANAGE = ["manage_minutes", "manage_users"];
const norm = (e: string) => e.trim().toLowerCase();

/**
 * Takes minutes that are out for signing back to Draft, so the words can be
 * edited and signing opened again. Carl, 14 Nov 2026.
 *
 * 🔴 Every signatory is dropped, so every code already emailed stops working,
 * and a paper scan uploaded during signing goes too (it carries the old words).
 * Anyone who already signed loses that signature: they signed words that are
 * about to change. Only the signatures the page NAMED may go: the caller sends
 * the emails it showed (`discardSignatures`), and a signature that is not in
 * that list (someone signed after the page loaded) stops the whole thing.
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
  const named = new Set(Array.isArray(body.discardSignatures) ? body.discardSignatures.filter((e: unknown) => typeof e === "string").map(norm) : []);

  let dropped: string[] = [];
  let updated;
  try {
    updated = await updateMinutes(id, (current) => {
      if (current.status !== "awaiting_signatures") throw new MinutesChangeRefused("These minutes are not out for signing.");
      const signed = current.signatories.filter((s) => s.signedAt);
      // Checked on the copy being saved, against what the page showed.
      const unseen = signed.filter((s) => !named.has(norm(s.email))).map((s) => s.name);
      if (unseen.length) {
        throw new MinutesChangeRefused(
          `${unseen.join(", ")} signed since this page loaded, so nothing was changed. The page has been refreshed: check and try again.`,
        );
      }
      dropped = signed.map((s) => s.name);
      return { status: "draft" as const, signatories: [], signedCopy: undefined };
    });
  } catch (e) {
    if (e instanceof MinutesChangeRefused) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof MinutesLockedError) {
      return NextResponse.json({ error: "Everyone has signed these minutes, so they are closed and cannot go back to draft." }, { status: 409 });
    }
    throw e;
  }
  if (!updated) return NextResponse.json({ error: "Minutes not found" }, { status: 404 });

  // The change is saved: a log failure must not report it as failed.
  try {
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
  } catch (e) {
    console.error("back-to-draft: activity log failed", e);
  }
  return NextResponse.json({ record: minutesForClient(updated), dropped });
}
