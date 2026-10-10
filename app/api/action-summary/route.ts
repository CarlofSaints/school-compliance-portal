import { NextRequest, NextResponse } from "next/server";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { requireAnyPermission } from "@/lib/rolesData";
import { getUserById, getUsers } from "@/lib/userData";
import { getTags, getTagCounts } from "@/lib/tagData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { isEmailConfigured } from "@/lib/email";
import { isPlausibleEmail } from "@/lib/emailIdentity";
import { ACTION_ADMIN_PERMISSIONS } from "@/lib/actionItemRecipients";
import { contentDisposition } from "@/lib/contentDisposition";
import { WEEKDAY_LABELS } from "@/lib/weeklyUpdate";
import {
  countRows,
  describeSchedule,
  nextSummaryOn,
  parseActionSummary,
  scheduleChanged,
  schoolNow,
  schoolToday,
} from "@/lib/actionSummary";
import {
  buildSummaryFile,
  gatherSummaryRows,
  getActionSummarySettings,
  resolveSummaryRecipients,
  patchActionSummarySettings,
  sendActionSummary,
} from "@/lib/actionSummaryData";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const noStore = { headers: { "Cache-Control": "no-store" } };

// The admin screen: the schedule, the list, who it resolves to today, and the
// numbers it would send right now. ?download=1 returns the workbook itself.
export async function GET(req: NextRequest) {
  const session = await requireAnyPermission(req, ACTION_ADMIN_PERMISSIONS);
  if (session instanceof NextResponse) return session;

  if (req.nextUrl.searchParams.get("download") === "1") {
    // As this admin may see it: no rows from minutes they may not read.
    const file = await buildSummaryFile(undefined, session.id);
    return new NextResponse(new Uint8Array(file.content), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": contentDisposition(file.filename),
        "Cache-Control": "no-store",
      },
    });
  }

  const settings = await getActionSummarySettings();
  const [users, tags, tagCounts, rows, resolved] = await Promise.all([
    getUsers(),
    getTags(),
    getTagCounts(),
    gatherSummaryRows(settings.dueSoonDays, schoolNow()),
    resolveSummaryRecipients(settings),
  ]);

  return NextResponse.json(
    {
      settings,
      nextSendOn: nextSummaryOn(settings),
      scheduleText: describeSchedule(settings, WEEKDAY_LABELS),
      emailConfigured: isEmailConfigured(),
      counts: countRows(rows),
      users: users
        .map((u) => ({ id: u.id, name: `${u.name || ""} ${u.surname || ""}`.trim(), email: u.email || "" }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      tags: tags.map((t) => ({ id: t.id, name: t.name, members: tagCounts[t.id] || 0 })),
      recipients: resolved.recipients,
      problems: resolved.problems,
    },
    noStore
  );
}

// Save the schedule and the list.
export async function PUT(req: NextRequest) {
  const session = await requireAnyPermission(req, ACTION_ADMIN_PERMISSIONS);
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => ({}));
  const current = await getActionSummarySettings();
  const incoming = parseActionSummary({ ...current, ...body });

  const badEmails = incoming.extraEmails.filter((e) => !isPlausibleEmail(e));
  if (badEmails.length) {
    return NextResponse.json(
      { error: `Not an email address: ${badEmails.join(", ")}` },
      { status: 400 }
    );
  }

  const switchingOn = incoming.enabled && !current.enabled;
  const next = {
    ...current,
    enabled: incoming.enabled,
    frequency: incoming.frequency,
    weekday: incoming.weekday,
    dayOfMonth: incoming.dayOfMonth,
    userIds: incoming.userIds,
    tagIds: incoming.tagIds,
    extraEmails: incoming.extraEmails,
    dueSoonDays: incoming.dueSoonDays,
    // Stamped when it is switched ON, and again when the send day changes
    // while it is on: the first send is the next send day after today
    // (never a "catch-up" for a day it was not yet scheduled on), and
    // fortnightly counts its weeks from here.
    enabledOn:
      switchingOn || (incoming.enabled && scheduleChanged(current, incoming))
        ? schoolToday()
        : current.enabledOn,
  };

  // Refused rather than saved: switched on with nobody on the list would
  // look scheduled and send nothing, every time.
  const resolved = await resolveSummaryRecipients(next);
  if (next.enabled) {
    if (resolved.recipients.length === 0) {
      return NextResponse.json(
        { error: "Pick at least one person, tag or address with a usable email before switching it on." },
        { status: 400 }
      );
    }
  }

  // Only the fields this form owns, in one guarded write against the settings
  // AS THEY ARE NOW: a send stamping lastSentOn meanwhile is neither lost nor
  // put back (which would let a later run send the same day again).
  const { lastSentOn: _sent, lastResult: _result, ...owned } = next;
  await patchActionSummarySettings(() => owned);

  await recordActivity({
    ...actorFrom(req, session),
    action: switchingOn
      ? "action_summary.enabled"
      : !next.enabled && current.enabled
        ? "action_summary.disabled"
        : "action_summary.updated",
    entity: "system",
    summary: switchingOn
      ? `Switched the action items summary email on: ${describeSchedule(next, WEEKDAY_LABELS)}`
      : !next.enabled && current.enabled
        ? "Switched the action items summary email off"
        : "Changed the action items summary email settings",
    detail: {
      frequency: next.frequency,
      users: next.userIds.length,
      tags: next.tagIds.length,
      addresses: next.extraEmails.length,
    },
  });

  // Counts again, because "due soon" may have just changed what they are.
  const rows = await gatherSummaryRows(next.dueSoonDays, schoolNow());
  return NextResponse.json(
    {
      settings: next,
      counts: countRows(rows),
      nextSendOn: nextSummaryOn(next),
      scheduleText: describeSchedule(next, WEEKDAY_LABELS),
      recipients: resolved.recipients,
      problems: resolved.problems,
    },
    noStore
  );
}

// { action: "preview" } sends one copy to whoever pressed the button.
// { action: "send" } sends to the list now, and counts as a send.
export async function POST(req: NextRequest) {
  const session = await requireAnyPermission(req, ACTION_ADMIN_PERMISSIONS);
  if (session instanceof NextResponse) return session;

  // Sends email (paid, Resend): per person per hour.
  const emailLimited = await enforce([[LIMITS.emailSendUser, session.id]]);
  if (emailLimited) return emailLimited;

  const body = await req.json().catch(() => ({}));

  if (body?.action === "preview") {
    const me = await getUserById(session.id);
    if (!me?.email) {
      return NextResponse.json(
        { error: "Your account has no email address to send a preview to." },
        { status: 400 }
      );
    }
    const result = await sendActionSummary({
      onlyTo: { email: me.email, name: `${me.name} ${me.surname}`.trim() },
    });
    if (result.failed) {
      return NextResponse.json({ error: result.summary }, { status: 502 });
    }
    return NextResponse.json(result, noStore);
  }

  if (body?.action === "send") {
    const result = await sendActionSummary({});
    await recordActivity({
      ...actorFrom(req, session),
      action: "action_summary.sent",
      entity: "system",
      summary: `Sent the action items summary by hand: ${result.summary}`,
    });
    return NextResponse.json(result, noStore);
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
