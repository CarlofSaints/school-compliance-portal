import { readJson, writeJson, updateJson, NO_CHANGE } from "./controlData";
import { getUsers } from "./userData";
import { getActionItems } from "./actionItemData";
import { listMinutes, type MinutesRecord } from "./minutesData";
import {
  loadMinutesAccessContext,
  readerForUser,
  viewerMayRead,
  actionVisible,
  type MinutesAccessContext,
} from "./minutesAccess";
import { getSpendApplications } from "./spendData";
import { getRoles, resolveRolePermissions } from "./rolesData";
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

/**
 * Changes some settings fields in one guarded write (lib/controlData.ts),
 * against the settings AS THEY ARE NOW. The admin's save touches only the
 * schedule and a send touches only lastSentOn / lastResult, so neither can put
 * back what the other just wrote.
 */
export async function patchWeeklyUpdateSettings(
  change: (current: WeeklyUpdateSettings) => Partial<WeeklyUpdateSettings> | typeof NO_CHANGE
): Promise<WeeklyUpdateSettings> {
  return parseWeeklyUpdate(
    await updateJson<WeeklyUpdateSettings>(PATH, DEFAULT_WEEKLY_UPDATE, (raw) => {
      const current = parseWeeklyUpdate(raw);
      const patch = change(current);
      return patch === NO_CHANGE ? NO_CHANGE : { ...current, ...patch };
    })
  );
}

export interface WeeklyRecipient {
  id: string;
  name: string;
  email: string;
  notActivated: boolean;
  /** Holds view_all_spend, the permission the portal's own Spend page uses to
   *  show every application. Nobody learns about spend by email that they
   *  could not see by logging in. */
  seesSpend: boolean;
  /** For the minutes block: each copy lists only minutes this person may read. */
  permissions: string[];
  tagIds: string[];
}

/** Every user with a usable address, once each. Users who have never signed
 *  in are INCLUDED: their address is on the account from the day it was made,
 *  and the email tells them how to finish signing in. */
export async function weeklyRecipients(): Promise<{
  recipients: WeeklyRecipient[];
  noEmail: string[];
}> {
  const [users, roles] = await Promise.all([getUsers(), getRoles()]);
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
    const perms = resolveRolePermissions(u.role, roles.find((r) => r.id === u.role));
    recipients.push({
      id: u.id,
      name,
      email,
      notActivated: !!u.forcePasswordChange,
      seesSpend: perms.includes("view_all_spend"),
      permissions: perms,
      tagIds: u.tagIds || [],
    });
  }
  return { recipients, noEmail };
}

export async function gatherWeeklyFacts(now: Date = new Date()): Promise<WeeklyFacts> {
  const [actions, users, minutes, spend] = await Promise.all([
    getActionItems(),
    getUsers(),
    listMinutes(),
    getSpendApplications(),
  ]);
  return buildWeeklyFacts(actions, users, minutes, spend, now);
}

export interface WeeklySendResult {
  sent: number;
  failed: number;
  total: number;
  summary: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One recipient's copy of the facts: the minutes block keeps only sets this
 * person may read. A line with no id is dropped rather than shown, so the
 * filter fails closed. Everything else is the same for everyone.
 */
function factsFor(
  facts: WeeklyFacts,
  who: { id: string; email: string; tagIds: string[]; permissions: string[] },
  records: Map<string, MinutesRecord>,
  ctx: MinutesAccessContext
): WeeklyFacts {
  const reader = readerForUser({ id: who.id, email: who.email, tagIds: who.tagIds }, who.permissions, ctx);
  const overdueList = facts.actions.overdueList.filter((line) =>
    actionVisible({ fromMinutes: line.fromMinutes, assigneeIds: line.assigneeIds || [] }, reader, records, ctx)
  );
  const hidden = facts.actions.overdueList.length - overdueList.length;
  return {
    ...facts,
    actions: {
      ...facts.actions,
      // The list is never capped when counted, so the difference is exactly
      // the overdue actions this reader may not see; the figures follow it.
      overdue: facts.actions.overdue - hidden,
      open: facts.actions.open - hidden,
      overdueList,
    },
    minutes: facts.minutes.filter((line) => {
      const record = line.minutesId ? records.get(line.minutesId) : undefined;
      return !!record && viewerMayRead(record, reader.viewer, ctx);
    }),
  };
}

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
  /** The scheduled run. It claims the day first, so two runs at once cannot
   *  both send; a send an admin presses on purpose is not blocked by it. */
  scheduled?: boolean;
  onlyTo?: {
    email: string;
    name: string;
    notActivated: boolean;
    seesSpend: boolean;
    userId: string;
    permissions: string[];
    tagIds: string[];
  };
}): Promise<WeeklySendResult> {
  const now = opts.now ?? new Date();
  const [settings, branding, facts, minutesList, accessCtx] = await Promise.all([
    getWeeklyUpdateSettings(),
    resolveBranding(),
    gatherWeeklyFacts(now),
    listMinutes(),
    loadMinutesAccessContext(),
  ]);
  const minutesById = new Map(minutesList.map((m) => [m.id, m]));
  const teamName = teamNameFor(settings, branding.fullName);
  const today = todayIso(now);
  const weekOf = lastOccurrence(today, 1); // the Monday of this week

  if (opts.onlyTo) {
    const ok = await sendWeeklyUpdateEmail(opts.onlyTo.email, opts.onlyTo.name, {
      teamName,
      weekOf,
      facts: factsFor(
        facts,
        { id: opts.onlyTo.userId, email: opts.onlyTo.email, tagIds: opts.onlyTo.tagIds, permissions: opts.onlyTo.permissions },
        minutesById,
        accessCtx
      ),
      notActivated: opts.onlyTo.notActivated,
      seesSpend: opts.onlyTo.seesSpend,
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
  // Stamped BEFORE the first email, in one guarded write. A scheduled run
  // that finds today already stamped stops: another run got there first.
  let claimed = true;
  await patchWeeklyUpdateSettings((current) => {
    if (opts.scheduled && current.lastSentOn === today) {
      claimed = false;
      return NO_CHANGE;
    }
    claimed = true;
    return { lastSentOn: today, lastResult: `sending to ${recipients.length}...` };
  });
  if (!claimed) {
    return { sent: 0, failed: 0, total: 0, summary: "already sent today by another run" };
  }

  let sent = 0;
  let failed = 0;
  for (const [i, r] of recipients.entries()) {
    // One at a time with a gap: a burst to a whole school is what gets a new
    // sending domain rate-limited or binned.
    if (i > 0) await sleep(600);
    const ok = await sendWeeklyUpdateEmail(r.email, r.name, {
      teamName,
      weekOf,
      facts: factsFor(facts, r, minutesById, accessCtx),
      notActivated: r.notActivated,
      seesSpend: r.seesSpend,
    });
    if (ok) sent++;
    else failed++;
  }

  const summary =
    `sent to ${sent} of ${recipients.length}` +
    (failed ? `, ${failed} failed` : "") +
    (noEmail.length ? `; no email address for: ${noEmail.join(", ")}` : "");
  await patchWeeklyUpdateSettings(() => ({ lastSentOn: today, lastResult: `${today}: ${summary}` }));
  return { sent, failed, total: recipients.length, summary };
}
