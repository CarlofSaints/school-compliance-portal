import { NextRequest, NextResponse } from "next/server";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { requirePermission } from "@/lib/rolesData";
import { getUserById } from "@/lib/userData";
import { resolveBranding } from "@/lib/brandingData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { isEmailConfigured } from "@/lib/email";
import { todayIso } from "@/lib/actionItems";
import {
  defaultTeamName,
  nextSendOn,
  parseWeeklyUpdate,
} from "@/lib/weeklyUpdate";
import {
  gatherWeeklyFacts,
  getWeeklyUpdateSettings,
  patchWeeklyUpdateSettings,
  sendWeeklyUpdate,
  weeklyRecipients,
} from "@/lib/weeklyUpdateData";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PERMISSION = "manage_users";
const noStore = { headers: { "Cache-Control": "no-store" } };

// The admin screen: the schedule, who it goes to, and the numbers it would
// send if it went out right now.
export async function GET(req: NextRequest) {
  const session = await requirePermission(req, PERMISSION);
  if (session instanceof NextResponse) return session;

  const [settings, branding, facts, { recipients, noEmail }] = await Promise.all([
    getWeeklyUpdateSettings(),
    resolveBranding(),
    gatherWeeklyFacts(),
    weeklyRecipients(),
  ]);

  return NextResponse.json(
    {
      settings,
      defaultTeamName: defaultTeamName(branding.fullName),
      nextSendOn: nextSendOn(settings),
      emailConfigured: isEmailConfigured(),
      facts,
      recipients,
      noEmail,
    },
    noStore
  );
}

// Save the schedule.
export async function PUT(req: NextRequest) {
  const session = await requirePermission(req, PERMISSION);
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => ({}));
  const before = await getWeeklyUpdateSettings();
  // Only the schedule fields, worked out from the settings AS THEY ARE NOW and
  // saved in one guarded write, so a send stamping lastSentOn at the same
  // moment is neither lost nor put back.
  const next = await patchWeeklyUpdateSettings((current) => {
    const incoming = parseWeeklyUpdate({ ...current, ...body });
    return {
      enabled: incoming.enabled,
      weekday: incoming.weekday,
      teamName: incoming.teamName,
      // Stamped each time it is switched ON, so turning it on mid-week waits
      // for the next send day instead of firing a catch-up tomorrow morning.
      enabledOn: incoming.enabled && !current.enabled ? todayIso() : current.enabledOn,
    };
  });
  const current = before;

  if (next.enabled !== current.enabled) {
    await recordActivity({
      ...actorFrom(req, session),
      action: next.enabled ? "weekly_update.enabled" : "weekly_update.disabled",
      entity: "system",
      summary: next.enabled
        ? "Switched the weekly SGB update email on"
        : "Switched the weekly SGB update email off",
      detail: { weekday: next.weekday },
    });
  }

  return NextResponse.json(
    { settings: next, nextSendOn: nextSendOn(next) },
    noStore
  );
}

// { action: "preview" } sends one copy to whoever pressed the button.
// { action: "send" } sends to everyone now, and counts as this week's send.
export async function POST(req: NextRequest) {
  const session = await requirePermission(req, PERMISSION);
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
    const result = await sendWeeklyUpdate({
      onlyTo: {
        email: me.email,
        name: `${me.name} ${me.surname}`.trim(),
        // Previewed as the admin sees it, plus the "not signed in yet" box
        // when asked, so both versions can be checked.
        notActivated: body?.asNotActivated === true,
        // Previewed with exactly what this admin would receive.
        seesSpend: session.permissions.includes("view_all_spend"),
        // And with only the minutes this admin may read.
        userId: me.id,
        permissions: session.permissions,
        tagIds: me.tagIds || [],
      },
    });
    if (result.failed) {
      return NextResponse.json({ error: result.summary }, { status: 502 });
    }
    return NextResponse.json(result, noStore);
  }

  if (body?.action === "send") {
    const result = await sendWeeklyUpdate({});
    await recordActivity({
      ...actorFrom(req, session),
      action: "weekly_update.sent",
      entity: "system",
      summary: `Sent the weekly SGB update by hand: ${result.summary}`,
    });
    return NextResponse.json(result, noStore);
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
