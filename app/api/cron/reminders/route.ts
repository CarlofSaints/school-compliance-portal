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
import { getActionItems, claimActionChase, updateActionItem, todayIso } from "@/lib/actionItemData";
import { actionsDueForChase, chaseActionItem } from "@/lib/actionItemNotify";
import { loadActionRecipientContext } from "@/lib/actionItemRecipients";
import { sendSpendReminderEmail, isEmailConfigured, sendSchoolsDueForDeletionEmail } from "@/lib/email";
import { weeklyUpdateDue } from "@/lib/weeklyUpdate";
import {
  getWeeklyUpdateSettings,
  sendWeeklyUpdate,
} from "@/lib/weeklyUpdateData";
import { actionSummaryDue } from "@/lib/actionSummary";
import {
  getActionSummarySettings,
  sendActionSummary,
} from "@/lib/actionSummaryData";
import { runRequestLapses, runRoomBookingReminders, runSettleMoves } from "@/lib/roomBookingNotify";
import { isMultiTenant, listTenants } from "@/lib/tenantRegistry";
import { remindToday } from "@/lib/schoolRetention";
import { runAsTenant } from "@/lib/tenantContext";

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
    // Into every school's own run log, so an admin can see why nothing came.
    await logToEverySchool("CRON_SECRET is not set on this deployment - nothing was sent");
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // A single-school deployment (HVPS, Jeppe) IS its school: one run, as before.
  if (!isMultiTenant()) return NextResponse.json(await runForSchool());

  // 🔴 The shared deployment hosts many schools and the cron arrives on an
  // address that belongs to none of them. Until 26 Oct it ran nothing for any
  // school that signed up itself: no action chases, no weekly update, no
  // summary, no booking reminders. Each school now runs in its OWN store, and
  // writes its own run log, one after another. One school failing must not
  // cost the rest of them their morning.
  // shortcut: one school after another inside maxDuration (300 s); the start
  // rotates daily so a time-out never starves the same school twice running.
  // Fan out per school (a queue) once there are dozens.
  // ⚠️ When HVPS or Jeppe moves onto the shared deployment, turn its OLD
  // project's cron off the same day: spend and booking reminders have no
  // claim step and would send twice.
  const active = (await listTenants()).filter((t) => t.status === "active");
  const start = active.length ? Math.floor(Date.now() / 86_400_000) % active.length : 0;
  const schools: Record<string, unknown> = {};
  let failedSchools = 0;
  for (const tenant of [...active.slice(start), ...active.slice(0, start)]) {
    try {
      schools[tenant.key] = await runAsTenant(tenant.key, runForSchool);
    } catch (err) {
      failedSchools++;
      const why = err instanceof Error ? err.message : String(err);
      console.error(`[cron/reminders] ${tenant.key} failed:`, err);
      schools[tenant.key] = { error: why };
      // Its own run log still says so: a failed morning must not look like a
      // cron that never fired.
      await runAsTenant(tenant.key, () =>
        recordRun({ at: new Date().toISOString(), due: 0, sent: 0, skipped: 0, failed: 1, detail: [`The morning run failed: ${why}`] })
      ).catch((e) => console.error(`[cron/reminders] ${tenant.key}: could not log the failure:`, e));
    }
  }
  // Schools suspended 90 days ago: the Terms promise deletion, a person does it.
  const dueForDeletion = (await listTenants().catch(() => [])).filter((t) => remindToday(t));
  if (dueForDeletion.length) {
    await sendSchoolsDueForDeletionEmail(dueForDeletion, req.nextUrl.origin).catch((e) =>
      console.error("[cron/reminders] deletion reminder failed:", e)
    );
  }
  // Every school failing is an outage, so Vercel shows the cron red.
  const allFailed = active.length > 0 && failedSchools === active.length;
  return NextResponse.json({ schools }, { status: allFailed ? 500 : 200 });
}

/** One line in every school's run log (or this deployment's, if it is one school). */
async function logToEverySchool(line: string) {
  const run = { at: new Date().toISOString(), due: 0, sent: 0, skipped: 0, failed: 0, detail: [line] };
  if (!isMultiTenant()) return recordRun(run);
  for (const tenant of await listTenants().catch(() => [])) {
    await runAsTenant(tenant.key, () => recordRun(run)).catch((e) => console.error(`[cron/reminders] ${tenant.key}:`, e));
  }
}

/** Everything the morning run does for ONE school, in whichever store the
 *  caller has pinned. */
async function runForSchool() {
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
  // Read once for the run. If it fails, each action reads its own and fails
  // (and is retried) on its own below.
  // Minutes access is NOT loaded here: only a meeting action needs it, and it
  // is filled in (and retried, if it fails) by the first one that does.
  const recipientCtx = dueActions.length ? await loadActionRecipientContext(false).catch(() => undefined) : undefined;

  for (const item of dueActions) {
    // The run log is read by admins who may not read every set of minutes, so
    // an action raised in a meeting is named by its reference only.
    const label = item.fromMinutes ? item.ref : `${item.ref} ${item.title}`;
    // Claimed first, in one guarded write, so an overlapping run cannot send
    // the same chase twice.
    const claim = await claimActionChase(item.id, todayIso(now));
    if (!claim.claimed) {
      skipped++;
      detail.push(`Action ${label}: already chased today by another run`);
      continue;
    }
    let outcome;
    try {
      outcome = await chaseActionItem(item, now, "", recipientCtx);
    } catch (err) {
      // 🔴 The claim stamped today BEFORE sending. A failure here must hand the
      // day back, or the action looks chased, waits a whole cycle, and nobody
      // is told. One failed action also must not stop the rest of the run.
      const why = err instanceof Error ? err.message : String(err);
      await updateActionItem(item.id, {
        lastRemindedOn: claim.previous,
        lastReminderResult: `failed: ${why}`.slice(0, 300),
      }).catch(() => {});
      failed++;
      detail.push(`Action ${label}: failed (${why}), will try again next run`);
      continue;
    }
    sent += outcome.sent;
    failed += outcome.failed;
    if (outcome.sent === 0) skipped++;
    detail.push(`Action ${label}: ${outcome.result}`);
  }

  // --- Weekly SGB update ------------------------------------------------------
  //
  // Rides this cron too (05:00 UTC = 07:00 in South Africa). Due is derived
  // from the chosen weekday and the last send, like the action chases, so a
  // missed morning sends the next day rather than skipping the week.
  let weeklyDue = 0;
  const weekly = await getWeeklyUpdateSettings();
  if (weeklyUpdateDue(weekly, now)) {
    weeklyDue = 1;
    const result = await sendWeeklyUpdate({ now, scheduled: true });
    sent += result.sent;
    failed += result.failed;
    detail.push(`Weekly SGB update: ${result.summary}`);
  }

  // --- Action items summary --------------------------------------------------
  //
  // The full open register as an Excel workbook, to the list the admin chose,
  // on the schedule they chose. Due is derived the same way as the weekly
  // update. Wrapped on its own: a workbook that fails to build must not cost
  // the run log, which is written below and is how a silent cron is caught.
  let summaryDue = 0;
  try {
    const summarySettings = await getActionSummarySettings();
    if (actionSummaryDue(summarySettings, now)) {
      summaryDue = 1;
      const result = await sendActionSummary({ now, scheduled: true });
      sent += result.sent;
      failed += result.failed;
      detail.push(`Action items summary: ${result.summary}`);
    }
  } catch (err) {
    failed++;
    detail.push(`Action items summary failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // --- Meeting room bookings: reminders (see remindCutoffMs), lapses, stale moves ----
  // Wrapped on its own, like the summary: a failure must not cost the run log.
  let roomDue = 0;
  try {
    const rooms = await runRoomBookingReminders(now);
    roomDue = rooms.due;
    sent += rooms.sent;
    failed += rooms.failed;
    detail.push(...rooms.detail);
  } catch (err) {
    failed++;
    detail.push(`Room booking reminders failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    detail.push(...(await runSettleMoves(now)));
  } catch (err) {
    failed++;
    detail.push(`Room move settling failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    const lapses = await runRequestLapses(now);
    sent += lapses.lapsed - lapses.failed;
    failed += lapses.failed;
    detail.push(...lapses.detail);
  } catch (err) {
    failed++;
    detail.push(`Room request lapses failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const run = {
    at: new Date().toISOString(),
    due: due.length + dueActions.length + weeklyDue + summaryDue + roomDue,
    sent,
    skipped,
    failed,
    detail,
  };
  await recordRun(run);
  console.log("[cron/reminders]", JSON.stringify(run));
  return run;
}
