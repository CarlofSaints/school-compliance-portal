import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { ACTIVITY_VIEW_PERMISSIONS } from "@/lib/activityAccess";
import { redactMinutesActivity } from "@/lib/minutesAccess";
import { readSentEmail, readSentEmails, sentEmailMonths, type SentEmail } from "@/lib/sentEmails";
import type { SessionPayload } from "@/lib/roles";

// Who may read every fund application (the spend list's own rule).
const ALL_SPEND = ["view_all_spend", "manage_spend_settings"];

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
    return hidden ? { ...e, subject: "", html: undefined, attachments: undefined, hidden } : e;
  });
}

export async function GET(req: NextRequest) {
  const session = await requireAnyPermission(req, ACTIVITY_VIEW_PERMISSIONS);
  if (session instanceof NextResponse) return session;

  try {
    const months = await sentEmailMonths();
    const sp = req.nextUrl.searchParams;
    const month = sp.get("month") || months[0] || new Date().toISOString().slice(0, 7);
    const id = sp.get("id");

    // One email, read on its own when it is opened.
    if (id) {
      const found = await readSentEmail(month, id);
      if (!found) return NextResponse.json({ error: "Email not found" }, { status: 404 });
      const [one] = await applyAccess(session, [found]);
      return NextResponse.json(one, { headers: { "Cache-Control": "no-store" } });
    }

    // The list carries no bodies.
    const shown = await applyAccess(session, await readSentEmails(month));
    return NextResponse.json(
      {
        month,
        months,
        emails: shown.map((e) => {
          const { html: _html, ...rest } = e;
          return { ...rest, hasBody: !!_html };
        }),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    // A storage error must not read as "no emails sent".
    console.error("[sent emails] Could not read:", err);
    return NextResponse.json({ error: "Could not read the sent emails. Try again." }, { status: 500 });
  }
}
