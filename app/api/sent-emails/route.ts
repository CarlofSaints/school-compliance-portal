import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { ACTIVITY_VIEW_PERMISSIONS } from "@/lib/activityAccess";
import { redactMinutesActivity } from "@/lib/minutesAccess";
import { readSentEmail, readSentEmails, sentEmailMonths, SENT_PAGE_SIZE, type SentEmail } from "@/lib/sentEmails";
import type { SessionPayload } from "@/lib/roles";

// Who may read every fund application: exactly the spend pages' own rule.
const ALL_SPEND = ["view_all_spend"];

type Shown = SentEmail & { hidden?: "minutes" | "spend" };

/**
 * 🔴 The sent box must never be a second way to read what the reader may not:
 *  - minutes mail follows the minutes read rule (the activity log's own
 *    redaction, so the two can never disagree);
 *  - fund application mail follows view_all_spend.
 * A hidden email shows only that it was sent, to whom and when.
 */
async function applyAccess(session: SessionPayload, emails: SentEmail[]): Promise<Shown[]> {
  const probes = await redactMinutesActivity(
    session,
    emails.map((e) => ({ entity: e.minutesId ? "minutes" : "email", entityId: e.minutesId, summary: e.id }))
  );
  const seesSpend = session.permissions.some((p) => ALL_SPEND.includes(p));
  return emails.map((e, i) => {
    const hidden = probes[i].summary !== e.id ? "minutes" : e.kind.startsWith("spend.") && !seesSpend ? "spend" : undefined;
    // Hidden: only that it was sent, to whom and when. Not even which minutes.
    return hidden
      ? { ...e, subject: "", attachments: undefined, minutesId: undefined, error: undefined, hasBody: false, hidden }
      : e;
  });
}

export async function GET(req: NextRequest) {
  const session = await requireAnyPermission(req, ACTIVITY_VIEW_PERMISSIONS);
  if (session instanceof NextResponse) return session;

  try {
    const sp = req.nextUrl.searchParams;

    // One email and its body, read directly when it is opened.
    const id = sp.get("id");
    const at = sp.get("at");
    if (id && at) {
      const found = await readSentEmail(at, id);
      if (!found) return NextResponse.json({ error: "Email not found" }, { status: 404 });
      const [one] = await applyAccess(session, [found.email]);
      return NextResponse.json(
        { ...one, ...(one.hidden ? {} : { html: found.html }) },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const months = await sentEmailMonths();
    const month = sp.get("month") || months[0] || new Date().toISOString().slice(0, 7);
    // "before" is the last file name already shown: paging by name, not by
    // position, so mail sent meanwhile cannot shift a page and repeat rows.
    const { emails, total, next } = await readSentEmails(month, sp.get("before") || undefined);
    return NextResponse.json(
      { month, months, pageSize: SENT_PAGE_SIZE, total, next, emails: await applyAccess(session, emails) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    // A storage error must not read as "no emails sent".
    console.error("[sent emails] Could not read:", err);
    return NextResponse.json({ error: "Could not read the sent emails. Try again." }, { status: 500 });
  }
}
