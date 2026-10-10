import { readJson, writeJson, updateJson, NO_CHANGE } from "./controlData";
import { getUsers } from "./userData";
import { getPeople } from "./peopleData";
import { getTags, getTagMembers } from "./tagData";
import { getActionItems } from "./actionItemData";
import { displayNameFor } from "./actionItemRecipients";
import { resolveBranding } from "./brandingData";
import { isPlausibleEmail } from "./emailIdentity";
import { sendActionSummaryEmail } from "./email";
import { WEEKDAY_LABELS } from "./weeklyUpdate";
import {
  DEFAULT_ACTION_SUMMARY,
  buildSummaryRows,
  countRows,
  describeSchedule,
  parseActionSummary,
  schoolNow,
  schoolToday,
  type ActionSummarySettings,
  type SummaryRow,
} from "./actionSummary";
import { buildSummaryWorkbook, summaryFilename } from "./actionSummaryWorkbook";
import {
  loadMinutesAccessContext,
  loadRecipientResolver,
  minutesIndex,
  actionVisible,
  type Reader,
} from "./minutesAccess";

const PATH = "settings/action-summary.json";

export async function getActionSummarySettings(): Promise<ActionSummarySettings> {
  return parseActionSummary(await readJson(PATH, DEFAULT_ACTION_SUMMARY));
}

export async function saveActionSummarySettings(s: ActionSummarySettings): Promise<void> {
  return writeJson(PATH, s);
}

/** Records a send against the settings AS THEY ARE NOW, re-read at the moment
 *  of writing. Spreading a copy read at the start of the send would put back
 *  whatever an admin saved while the workbook was being built. */
async function recordSend(lastSentOn: string, lastResult: string): Promise<void> {
  await patchActionSummarySettings(() => ({ lastSentOn, lastResult }));
}

/** Changes some settings fields in one guarded write, against the settings AS
 *  THEY ARE NOW (see patchWeeklyUpdateSettings for why). */
export async function patchActionSummarySettings(
  change: (current: ActionSummarySettings) => Partial<ActionSummarySettings> | typeof NO_CHANGE
): Promise<ActionSummarySettings> {
  return parseActionSummary(
    await updateJson<ActionSummarySettings>(PATH, DEFAULT_ACTION_SUMMARY, (raw) => {
      const current = parseActionSummary(raw);
      const patch = change(current);
      return patch === NO_CHANGE ? NO_CHANGE : { ...current, ...patch };
    })
  );
}

export interface SummaryRecipient {
  email: string;
  name: string;
  /** Why they are on the list: "Picked by name", "Tag: FINCOM", "Added by address". */
  via: string;
}

/**
 * Who the summary goes to, resolved NOW from the people picked, the tags
 * picked and the addresses typed. Nothing picked means nobody: an empty list
 * never widens to "everyone".
 */
export async function resolveSummaryRecipients(s: ActionSummarySettings): Promise<{
  recipients: SummaryRecipient[];
  /** Picked but cannot be written to, with the reason. */
  problems: string[];
}> {
  const [users, people, tags] = await Promise.all([getUsers(), getPeople(), getTags()]);
  const out: SummaryRecipient[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  const add = (email: string, name: string, via: string) => {
    const key = String(email || "").trim().toLowerCase();
    if (!isPlausibleEmail(key)) {
      problems.push(`${name || "Somebody"} (${via}) has no usable email address`);
      return;
    }
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ email: key, name: name || key, via });
  };

  for (const id of s.userIds) {
    const u = users.find((x) => x.id === id);
    if (!u) {
      problems.push("A user picked for this list no longer exists");
      continue;
    }
    add(u.email, `${u.name || ""} ${u.surname || ""}`.trim(), "Picked by name");
  }

  for (const tagId of s.tagIds) {
    const tag = tags.find((t) => t.id === tagId);
    if (!tag) {
      problems.push("A tag picked for this list has been deleted");
      continue;
    }
    const members = await getTagMembers(tagId, { users, people });
    if (members.length === 0) problems.push(`Nobody carries the tag ${tag.name} yet`);
    for (const m of members) add(m.email, m.name, `Tag: ${tag.name}`);
  }

  for (const email of s.extraEmails) add(email, email, "Added by address");

  return { recipients: out, problems };
}

/** The open register as it stands, with owners named as the register names
 *  them today (the same refresh the Action Items page does). */
export async function gatherSummaryRows(dueSoonDays: number, now: Date = new Date()): Promise<SummaryRow[]> {
  const [items, people, users] = await Promise.all([getActionItems(), getPeople(), getUsers()]);
  const owners = new Map(
    items.map((i) => [
      i.id,
      i.assigneeIds.map((pid, n) => displayNameFor(pid, people, users, i.assigneeNames[n] || "")),
    ])
  );
  return buildSummaryRows(items, dueSoonDays, now, owners);
}

/**
 * Keeps only the rows this reader may see: an action raised in minutes they
 * may not read is left out, unless they are carrying it. Built once per send,
 * then applied per recipient.
 */
async function rowFilterFactory() {
  const [ctx, byId] = await Promise.all([loadMinutesAccessContext(), minutesIndex()]);
  const resolver = await loadRecipientResolver(ctx);
  const forReader = (reader: Reader) => (rows: SummaryRow[]) =>
    rows.filter((r) =>
      actionVisible(
        { fromMinutes: r.fromMinutesId ? { minutesId: r.fromMinutesId } : undefined, assigneeIds: r.assigneeIds || [] },
        reader,
        byId,
        ctx
      )
    );
  return {
    forEmail: (email: string) => forReader(resolver.forEmail(email)),
    // Fails closed: an id that matches no account sees no meeting-raised rows.
    forUserId: (id: string) => {
      const u = resolver.users.find((x) => x.id === id);
      return u ? forReader(resolver.forUser(u)) : (rows: SummaryRow[]) => rows.filter((r) => !r.fromMinutesId);
    },
  };
}

/** The workbook on its own, for the Download button, as THIS admin may see it. */
export async function buildSummaryFile(
  now: Date = new Date(),
  forUserId?: string
): Promise<{ filename: string; content: Buffer }> {
  const [settings, branding] = await Promise.all([getActionSummarySettings(), resolveBranding()]);
  const asOf = schoolToday(now);
  let rows = await gatherSummaryRows(settings.dueSoonDays, schoolNow(now));
  if (forUserId) rows = (await rowFilterFactory()).forUserId(forUserId)(rows);
  const content = await buildSummaryWorkbook({
    branding,
    rows,
    dueSoonDays: settings.dueSoonDays,
    asOf,
    scheduleText: settings.enabled ? describeSchedule(settings, WEEKDAY_LABELS) : "",
  });
  return { filename: summaryFilename(branding.shortName, asOf), content };
}

export interface SummarySendResult {
  sent: number;
  failed: number;
  total: number;
  summary: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends the summary. `onlyTo` = a preview to the admin pressing the button,
 * which does not count as a send.
 *
 * For a send to the list, lastSentOn is written BEFORE the first email: a
 * crash half way costs some people one summary, the other order could send
 * everybody the same one twice.
 */
export async function sendActionSummary(opts: {
  now?: Date;
  /** The scheduled run: claims the day first so two runs cannot both send. */
  scheduled?: boolean;
  onlyTo?: { email: string; name: string };
}): Promise<SummarySendResult> {
  const now = opts.now ?? new Date();
  const [settings, branding] = await Promise.all([getActionSummarySettings(), resolveBranding()]);
  const asOf = schoolToday(now);
  const rows = await gatherSummaryRows(settings.dueSoonDays, schoolNow(now));
  const scheduleText = settings.enabled ? describeSchedule(settings, WEEKDAY_LABELS) : "";
  const filename = summaryFilename(branding.shortName, asOf);

  // 🔴 Per recipient: an action raised in minutes somebody may not read (a
  // FINCOM-only set) is left out of THEIR email and workbook. Usually every
  // copy is the same, so workbooks are built once per distinct set of rows.
  const filters = await rowFilterFactory();
  const workbooks = new Map<string, Buffer>();
  const copyFor = async (email: string) => {
    const mine = filters.forEmail(email)(rows);
    const key = mine.map((r) => r.ref).join("|");
    let content = workbooks.get(key);
    if (!content) {
      content = await buildSummaryWorkbook({ branding, rows: mine, dueSoonDays: settings.dueSoonDays, asOf, scheduleText });
      workbooks.set(key, content);
    }
    return {
      attachment: { filename, content },
      email: { rows: mine, counts: countRows(mine), dueSoonDays: settings.dueSoonDays, asOf, scheduleText },
    };
  };

  if (opts.onlyTo) {
    const { attachment, email } = await copyFor(opts.onlyTo.email);
    const ok = await sendActionSummaryEmail(branding, opts.onlyTo.email, opts.onlyTo.name, { ...email, preview: true }, attachment);
    return {
      sent: ok ? 1 : 0,
      failed: ok ? 0 : 1,
      total: 1,
      summary: ok ? `preview sent to ${opts.onlyTo.email}` : `preview to ${opts.onlyTo.email} failed`,
    };
  }

  const { recipients, problems } = await resolveSummaryRecipients(settings);
  if (recipients.length === 0) {
    const summary = `nobody to send to${problems.length ? ` (${problems.join("; ")})` : ""}`;
    // Recorded as sent, so a schedule with an empty list does not retry the
    // same failure every morning of its catch-up window.
    await recordSend(asOf, `${asOf}: ${summary}`);
    return { sent: 0, failed: 0, total: 0, summary };
  }

  // Claimed in one guarded write before the first email.
  let claimed = true;
  await patchActionSummarySettings((current) => {
    if (opts.scheduled && current.lastSentOn === asOf) {
      claimed = false;
      return NO_CHANGE;
    }
    claimed = true;
    return { lastSentOn: asOf, lastResult: `sending to ${recipients.length}...` };
  });
  if (!claimed) {
    return { sent: 0, failed: 0, total: 0, summary: "already sent today by another run" };
  }

  let sent = 0;
  let failed = 0;
  for (const [i, r] of recipients.entries()) {
    // One at a time with a gap, like the weekly update.
    if (i > 0) await sleep(600);
    const { attachment, email } = await copyFor(r.email);
    const ok = await sendActionSummaryEmail(branding, r.email, r.name, email, attachment);
    if (ok) sent++;
    else failed++;
  }

  const summary =
    `sent to ${sent} of ${recipients.length}` +
    (failed ? `, ${failed} failed` : "") +
    (problems.length ? `; ${problems.join("; ")}` : "");
  await recordSend(asOf, `${asOf}: ${summary}`);
  return { sent, failed, total: recipients.length, summary };
}
