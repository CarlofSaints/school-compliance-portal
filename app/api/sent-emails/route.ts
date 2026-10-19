import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { ACTIVITY_VIEW_PERMISSIONS } from "@/lib/activityAccess";
import { redactMinutesActivity } from "@/lib/minutesAccess";
import { readSentEmails, sentEmailMonths, type SentEmail } from "@/lib/sentEmails";

// The sent box. Same people as the activity log, and the same rule for
// minutes: an email about minutes the reader may not read shows only that it
// was sent, never its subject or body.
export async function GET(req: NextRequest) {
  const session = await requireAnyPermission(req, ACTIVITY_VIEW_PERMISSIONS);
  if (session instanceof NextResponse) return session;

  const months = await sentEmailMonths();
  const sp = req.nextUrl.searchParams;
  const month = sp.get("month") || months[0] || new Date().toISOString().slice(0, 7);
  const id = sp.get("id");

  const all = await readSentEmails(month);
  // Through the activity log's own redaction, so the two can never disagree
  // about who may see what.
  const probes = await redactMinutesActivity(
    session,
    all.map((e) => ({ entity: e.minutesId ? "minutes" : "email", entityId: e.minutesId, summary: e.id }))
  );
  const visible = all.map((e, i): SentEmail & { hidden?: boolean } =>
    probes[i].summary === e.id
      ? e
      : { ...e, subject: "Email about minutes you do not have access to", html: undefined, attachments: undefined, hidden: true }
  );

  if (id) {
    const one = visible.find((e) => e.id === id);
    if (!one) return NextResponse.json({ error: "Email not found" }, { status: 404 });
    return NextResponse.json(one, { headers: { "Cache-Control": "no-store" } });
  }

  // The list carries no bodies; one is fetched when opened.
  return NextResponse.json(
    {
      month,
      months,
      emails: visible.map((e) => {
        const { html: _html, ...rest } = e;
        return { ...rest, hasBody: !!_html };
      }),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
