import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { sessionMayReadMinutes } from "@/lib/minutesAccess";
import { getMinutes, updateMinutes, MinutesChangeRefused } from "@/lib/minutesData";
import { signingProgress, paperTickerRole } from "@/lib/minutes";
import { documentHash, minutesForClient } from "@/lib/minutesSigning";
import { distributeOnFinalSignature } from "@/lib/minutesDistribution";
import { sendPaperSignatureNoticeEmail } from "@/lib/email";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { pause } from "@/lib/actionItemNotify";
import { LIMITS, enforce } from "@/lib/rateLimit";

const CAN_MANAGE = ["manage_minutes", "manage_users"];
const norm = (e: string) => e.trim().toLowerCase();

/**
 * Records who signed the PRINTED minutes.
 *
 * Carl: some people still print and sign. The admin, or anyone else on the
 * signing list, ticks who signed the paper copy. Those people count as signed
 * from then on, so they drop out of every "waiting on" list, and once nobody is
 * left the minutes close and go out exactly as they do after the last
 * signature in the app.
 *
 * 🔴 Only while out for signing: the text is frozen then, so what they signed
 * on paper is the version the hash below records.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const record = await getMinutes(id);
  if (!record || !(await sessionMayReadMinutes(session, record))) {
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

  const me = norm(session.email);
  const manages = session.permissions.some((p) => CAN_MANAGE.includes(p));
  if (!manages && !record.signatories.some((s) => norm(s.email) === me)) {
    return NextResponse.json(
      { error: "Only a minutes admin or somebody on the signing list can record a paper signature." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const emails: string[] = Array.isArray(body.emails)
    ? [...new Set((body.emails as unknown[]).filter((e): e is string => typeof e === "string").map(norm))]
    : [];
  if (emails.length === 0) {
    return NextResponse.json({ error: "Tick at least one person who signed the paper copy." }, { status: 400 });
  }

  // 🔴 Carl: only a minutes admin or the Principal may record OTHER people as
  // signing. Anyone else on the list records only themselves, or one member
  // could close and send the minutes on everybody's behalf.
  const byRole = paperTickerRole(manages, record.signatories, session.email);
  if (emails.some((e) => e !== me) && byRole === "signatory") {
    await recordActivity({
      ...actorFrom(req, session),
      action: "minutes.paper_signatures_refused",
      entity: "minutes",
      entityId: id,
      summary: `Tried to record other people as signing "${record.title}" on paper, refused (not a minutes admin or the Principal)`,
      // Only addresses really on the list, and at most a handful: whatever the
      // browser sent must not be able to fill the activity log.
      detail: {
        emails: emails.filter((e) => record.signatories.some((s) => norm(s.email) === e)).slice(0, 20),
        sent: emails.length,
      },
    });
    return NextResponse.json(
      { error: "Only a minutes admin or the Principal can record other people as signing on paper. You can record your own paper signature." },
      { status: 403 }
    );
  }

  // It sends email, so it shares the per-user email budget. After the refusal
  // above, so a refused attempt does not use it up.
  const limited = await enforce([[LIMITS.emailSendUser, session.id]]);
  if (limited) return limited;

  const hash = documentHash(record);
  const now = new Date().toISOString();
  const markedBy = `${session.name} ${session.surname}`.trim() || session.email;
  let marked: { name: string; email: string }[] = [];
  let progress = signingProgress(record.signatories);
  let updated;
  try {
    // Applied to the list AS IT IS AT SAVE TIME, so a code signature landing
    // in the same moment is neither lost nor ticked over.
    updated = await updateMinutes(id, (current) => {
      if (current.status !== "awaiting_signatures") {
        throw new MinutesChangeRefused("These minutes are no longer out for signing.");
      }
      // The role again, on the list as saved now: a list rebuilt since the read
      // above must not leave somebody with power they no longer hold.
      const roleNow = paperTickerRole(manages, current.signatories, session.email);
      if (emails.some((e) => e !== me) && roleNow !== "minutes admin" && roleNow !== "principal") {
        throw new MinutesChangeRefused("Only a minutes admin or the Principal can record other people as signing on paper.");
      }
      const unknown = emails.filter((e) => !current.signatories.some((s) => norm(s.email) === e));
      if (unknown.length) {
        throw new MinutesChangeRefused("Somebody ticked is not on the signing list for these minutes. Refresh and try again.");
      }
      marked = [];
      const signatories = current.signatories.map((s) => {
        // Already signed (either way): left exactly as it is.
        if (!emails.includes(norm(s.email)) || s.signedAt) return s;
        marked.push({ name: s.name, email: s.email });
        return {
          ...s,
          signedAt: now,
          documentHash: hash,
          onPaper: { markedBy, markedByEmail: session.email },
          // Their emailed code is no longer needed, and must not sign a second time.
          codeHash: undefined,
        };
      });
      if (marked.length === 0) {
        throw new MinutesChangeRefused("Everyone ticked has already signed.");
      }
      progress = signingProgress(signatories);
      return {
        signatories,
        status: progress.complete ? "signed" : "awaiting_signatures",
        signedAt: progress.complete ? now : undefined,
      };
    });
  } catch (err) {
    if (err instanceof MinutesChangeRefused) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  const actor = actorFrom(req, session);
  await recordActivity({
    ...actor,
    action: "minutes.paper_signatures_recorded",
    entity: "minutes",
    entityId: id,
    summary: `Recorded ${marked.map((m) => m.name).join(", ")} as signing "${record.title}" on paper, as ${byRole} (${progress.signed} of ${progress.total})`,
    detail: { emails: marked.map((m) => m.email), names: marked.map((m) => m.name), byRole, documentHash: hash, complete: progress.complete },
  });

  // Each person ticked hears about it, so a wrong tick is caught. Not the one
  // who ticked themselves: they know.
  // One at a time with a gap (the provider refuses bursts), and a notice that
  // did not go is logged: it is the safeguard against a wrong tick.
  const notNotified: string[] = [];
  for (const m of marked) {
    if (norm(m.email) === me) continue;
    if (!(await sendPaperSignatureNoticeEmail(m.email, m.name, record.title, id, markedBy).catch(() => false))) {
      notNotified.push(m.email);
    }
    await pause();
  }
  if (notNotified.length) {
    await recordActivity({
      ...actor,
      action: "minutes.paper_signature_notice_failed",
      entity: "minutes",
      entityId: id,
      summary: `Could not email ${notNotified.join(", ")} that they were recorded as signing "${record.title}" on paper`,
      detail: { emails: notNotified },
    });
  }

  if (progress.complete && updated) {
    await distributeOnFinalSignature(updated, actor);
  }

  return NextResponse.json({ record: minutesForClient(updated), progress });
}
