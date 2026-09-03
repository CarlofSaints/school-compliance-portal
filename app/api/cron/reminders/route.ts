import { NextRequest, NextResponse } from "next/server";
import { getSpendById, STATUS_DISPLAY } from "@/lib/spendData";
import {
  getReminders,
  updateReminder,
  isDue,
  advance,
  recordRun,
} from "@/lib/reminderData";
import { resolveRecipients } from "@/lib/reminderRecipients";
import { getActionItems } from "@/lib/actionItemData";
import { actionsDueForChase, chaseActionItem } from "@/lib/actionItemNotify";
import { sendSpendReminderEmail, isEmailConfigured } from "@/lib/email";

export const maxDuration = 300;

// Daily reminder sender. Wired up in vercel.json.
//
// It carries BOTH schedules - spend applications and the action-item register -
// on one cron rather than two. They send the same kind of mail on the same
// cadence, and a second cron is a second thing that can silently stop.
//
// Every run is written to the run log, including the runs that find nothing to
// do - a cron that has never fired and a cron that fires and sends nothing look
// identical otherwise. The log is written ONCE, at the end, with both schedules
// counted in: recordRun reads the file and writes it back, so calling it twice
// in one request would lose the first entry.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;

  // A missing secret is a misconfiguration, not a reason to run unprotected.
  if (!secret) {
    console.error("[cron/reminders] CRON_SECRET is not set - refusing to run");
    await recordRun({
      at: new Date().toISOString(),
      due: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      detail: ["CRON_SECRET is not set on this deployment - nothing was sent"],
    });
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const detail: string[] = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  if (!isEmailConfigured()) {
    detail.push(
      "RESEND_API_KEY is not set - reminders were processed but no email left the server"
    );
  }

  const reminders = await getReminders();
  const due = reminders.filter((r) => isDue(r));

  for (const reminder of due) {
    const app = await getSpendById(reminder.spendId);
    if (!app) {
      await updateReminder(reminder.id, {
        active: false,
        lastRunAt: new Date().toISOString(),
        lastResult: "Project no longer exists - reminder stopped",
      });
      skipped++;
      detail.push(`${reminder.projectName}: project deleted, reminder stopped`);
      continue;
    }

    // A reminder attached to an application stops itself once the decision is
    // in - nobody should be chased about something already settled.
    if (
      reminder.spendStopOnDecision &&
      ["approved", "rejected", "completed"].includes(app.status)
    ) {
      await updateReminder(reminder.id, {
        active: false,
        lastRunAt: new Date().toISOString(),
        lastResult: `Application is ${app.status} - reminder stopped`,
      });
      skipped++;
      detail.push(`${app.projectName}: ${app.status}, reminder stopped`);
      continue;
    }

    const { resolved, missing } = await resolveRecipients(
      app,
      reminder.recipients
    );

    if (resolved.length === 0) {
      const why = `no email address for: ${missing.join(", ") || "the chosen recipients"}`;
      await updateReminder(reminder.id, {
        lastRunAt: new Date().toISOString(),
        lastResult: why,
        ...advance(reminder),
      });
      skipped++;
      detail.push(`${app.projectName}: ${why}`);
      continue;
    }

    let ok = 0;
    for (const person of resolved) {
      const success = await sendSpendReminderEmail(
        person.email,
        person.name,
        app.projectName,
        app.estimatedAmount,
        STATUS_DISPLAY[app.status] || app.status,
        reminder.note,
        person.role
      );
      if (success) ok++;
      else failed++;
    }
    sent += ok;

    const result =
      missing.length > 0
        ? `sent to ${ok} of ${resolved.length}; no address for: ${missing.join(", ")}`
        : `sent to ${ok} of ${resolved.length}`;

    await updateReminder(reminder.id, {
      lastRunAt: new Date().toISOString(),
      lastResult: result,
      ...advance(reminder),
    });
    detail.push(`${app.projectName}: ${result}`);
  }

  // --- Action items ---------------------------------------------------------
  //
  // The chase sequence per action is a heads-up before the ETA, a nudge on the
  // day, then every few days while it stays open. All of that is derived from
  // the due date and the last send, so nothing here needs a stored schedule to
  // go stale.
  const now = new Date();
  const actions = await getActionItems();
  const dueActions = actionsDueForChase(actions, now);

  for (const item of dueActions) {
    const outcome = await chaseActionItem(item, now);
    sent += outcome.sent;
    failed += outcome.failed;
    if (outcome.sent === 0) skipped++;
    detail.push(`Action ${item.ref} ${item.title}: ${outcome.result}`);
  }

  const run = {
    at: new Date().toISOString(),
    due: due.length + dueActions.length,
    sent,
    skipped,
    failed,
    detail,
  };
  await recordRun(run);
  console.log("[cron/reminders]", JSON.stringify(run));

  return NextResponse.json(run);
}
