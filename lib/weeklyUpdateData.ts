import { readJson, writeJson } from "./controlData";
import { getUsers } from "./userData";
import { getActionItems } from "./actionItemData";
import { listMinutes } from "./minutesData";
import { resolveBranding } from "./brandingData";
import { isPlausibleEmail } from "./emailIdentity";
import { sendWeeklyUpdateEmail } from "./email";
import { todayIso } from "./actionItems";
import {
  DEFAULT_WEEKLY_UPDATE,
  buildWeeklyFacts,
  parseWeeklyUpdate,
  teamNameFor,
  lastOccurrence,
  type WeeklyFacts,
  type WeeklyUpdateSettings,
} from "./weeklyUpdate";

const PATH = "settings/weekly-update.json";

export async function getWeeklyUpdateSettings(): Promise<WeeklyUpdateSettings> {
  return parseWeeklyUpdate(await readJson(PATH, DEFAULT_WEEKLY_UPDATE));
}

export async function saveWeeklyUpdateSettings(s: WeeklyUpdateSettings): Promise<void> {
  return writeJson(PATH, s);
}

export interface WeeklyRecipient {
  id: string;
  name: string;
  email: string;
  notActivated: boolean;
}

/** Every user with a usable address, once each. Users who have never signed
 *  in are INCLUDED: their address is on the account from the day it was made,
 *  and the email tells them how to finish signing in. */
export async function weeklyRecipients(): Promise<{
  recipients: WeeklyRecipient[];
  noEmail: string[];
}> {
  const users = await getUsers();
  const seen = new Set<string>();
  const recipients: WeeklyRecipient[] = [];
  const noEmail: string[] = [];
  for (const u of users) {
    const email = String(u.email || "").trim().toLowerCase();
    const name = `${u.name || ""} ${u.surname || ""}`.trim();
    if (!isPlausibleEmail(email)) {
      noEmail.push(name || u.id);
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    recipients.push({ id: u.id, name, email, notActivated: !!u.forcePasswordChange });
  }
  return { recipients, noEmail };
}

export async function gatherWeeklyFacts(now: Date = new Date()): Promise<WeeklyFacts> {
  const [actions, users, minutes] = await Promise.all([
    getActionItems(),
    getUsers(),
    listMinutes(),
  ]);
  return buildWeeklyFacts(actions, users, minutes, now);
}

export interface WeeklySendResult {
  sent: number;
  failed: number;
  total: number;
  summary: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends the update. `onlyTo` = a preview to one address (the admin pressing
 * the button), which does not count as the week's send.
 *
 * For a send to everyone, lastSentOn is written BEFORE the first email. A
 * crash half way then costs some people one week's update; the other order
 * could send the whole school the same email twice.
 */
export async function sendWeeklyUpdate(opts: {
  now?: Date;
  onlyTo?: { email: string; name: string; notActivated: boolean };
}): Promise<WeeklySendResult> {
  const now = opts.now ?? new Date();
  const [settings, branding, facts] = await Promise.all([
    getWeeklyUpdateSettings(),
    resolveBranding(),
    gatherWeeklyFacts(now),
  ]);
  const teamName = teamNameFor(settings, branding.fullName);
  const today = todayIso(now);
  const weekOf = lastOccurrence(today, 1); // the Monday of this week

  if (opts.onlyTo) {
    const ok = await sendWeeklyUpdateEmail(opts.onlyTo.email, opts.onlyTo.name, {
      teamName,
      weekOf,
      facts,
      notActivated: opts.onlyTo.notActivated,
      preview: true,
    });
    return {
      sent: ok ? 1 : 0,
      failed: ok ? 0 : 1,
      total: 1,
      summary: ok ? `preview sent to ${opts.onlyTo.email}` : `preview to ${opts.onlyTo.email} failed`,
    };
  }

  const { recipients, noEmail } = await weeklyRecipients();
  await saveWeeklyUpdateSettings({
    ...settings,
    lastSentOn: today,
    lastResult: `sending to ${recipients.length}...`,
  });

  let sent = 0;
  let failed = 0;
  for (const [i, r] of recipients.entries()) {
    // One at a time with a gap: a burst to a whole school is what gets a new
    // sending domain rate-limited or binned.
    if (i > 0) await sleep(600);
    const ok = await sendWeeklyUpdateEmail(r.email, r.name, {
      teamName,
      weekOf,
      facts,
      notActivated: r.notActivated,
    });
    if (ok) sent++;
    else failed++;
  }

  const summary =
    `sent to ${sent} of ${recipients.length}` +
    (failed ? `, ${failed} failed` : "") +
    (noEmail.length ? `; no email address for: ${noEmail.join(", ")}` : "");
  await saveWeeklyUpdateSettings({
    ...(await getWeeklyUpdateSettings()),
    lastSentOn: today,
    lastResult: `${today}: ${summary}`,
  });
  return { sent, failed, total: recipients.length, summary };
}
