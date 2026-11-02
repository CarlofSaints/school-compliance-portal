import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { sessionMayReadMinutes } from "@/lib/minutesAccess";
import { getMinutes, updateMinutes, MinutesChangeRefused } from "@/lib/minutesData";
import { signingProgress } from "@/lib/minutes";
import { documentHash, minutesForClient } from "@/lib/minutesSigning";
import { distributeOnFinalSignature } from "@/lib/minutesDistribution";
import { sendPaperSignatureNoticeEmail } from "@/lib/email";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

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
    action: "minutes.signed_on_paper",
    entity: "minutes",
    entityId: id,
    summary: `Recorded ${marked.map((m) => m.name).join(", ")} as signing "${record.title}" on paper (${progress.signed} of ${progress.total})`,
    detail: { emails: marked.map((m) => m.email), documentHash: hash, complete: progress.complete },
  });

  // Each person ticked hears about it, so a wrong tick is caught. Not the one
  // who ticked themselves: they know.
  for (const m of marked) {
    if (norm(m.email) === me) continue;
    await sendPaperSignatureNoticeEmail(m.email, m.name, record.title, id, markedBy).catch(() => false);
  }

  if (progress.complete && updated) {
    await distributeOnFinalSignature(updated, actor);
  }

  return NextResponse.json({ record: minutesForClient(updated), progress });
}
