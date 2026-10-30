import { randomUUID } from "crypto";
import { readJson, updateJson, addToList, NO_CHANGE } from "./controlData";
import { getUsers } from "./userData";
import { sendCampusEmail } from "./email";
import { recordActivity } from "./activityLog";
import { createShareLink, getGuests, guestProgressId, type ShareKind } from "./campusShare";
import { getMaterials, getModules, getProgress, getTests } from "./trainingData";
import { hasPassed, liveKeys, type Material, type Progress, type Test, type TrainingModule } from "./training";
import { todaySast } from "./governanceTerm";

export { todaySast };

// ---------------------------------------------------------------------------
// Campus emails: send a module, lesson or test to people, now or on a date,
// with optional reminders to whoever has not finished it. Runs on the existing
// daily job (07:00 SAST) for anything scheduled or due a reminder.
//
// - Recipients are FROZEN when it goes out (who was emailed), and saved before
//   the first email leaves, so a reminder reaches the same people and nobody
//   added later is nagged for something they were never sent.
// - Locked or retired members (term ended) are left out, and their addresses
//   are never treated as outside addresses (that would let them in by link).
// - People without a portal account (typed addresses) get a share link made
//   for this send, so they can do it without signing in.
// - Done means: a lesson opened, a test passed, every published step of a
//   module done. Only people not done are reminded.
// - Sends are paced (Resend allows about two a second) and capped, so one
//   send finishes inside a function's time.
// ---------------------------------------------------------------------------

export interface Recipient {
  email: string;
  name: string;
  /** Portal user id, or absent for a typed address (they use the share link). */
  userId?: string;
}

export interface CampusSend {
  id: string;
  kind: ShareKind;
  targetId: string;
  title: string;
  subject: string;
  message: string;
  everyone: boolean;
  userIds: string[];
  externalEmails: string[];
  /** YYYY-MM-DD; goes out on the first daily run on or after it. */
  sendOn: string;
  status: "scheduled" | "sending" | "sent" | "cancelled";
  /** When "sending" began; a send stuck there (the function was stopped) is closed off later. */
  claimedAt?: string;
  /** Why the system cancelled or closed it, e.g. the training was unpublished. */
  note?: string;
  shareToken?: string;
  recipients?: Recipient[];
  sentAt?: string;
  sentCount?: number;
  failedCount?: number;
  /** 0 = no reminders. */
  remindEveryDays: number;
  remindMax: number;
  remindersSent: number;
  lastRemindedOn?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

const PATH = "training/sends.json";
export const getSends = () => readJson<CampusSend[]>(PATH, []);
/** Most people one send may reach: at about two a second it must finish inside the function's time. */
export const MAX_RECIPIENTS = 300;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function createSend(send: Omit<CampusSend, "id" | "status" | "remindersSent" | "createdAt">): Promise<CampusSend> {
  const full: CampusSend = { ...send, id: randomUUID(), status: "scheduled", remindersSent: 0, createdAt: new Date().toISOString() };
  await addToList(PATH, full);
  return full;
}

async function change(id: string, fn: (s: CampusSend) => CampusSend | null): Promise<CampusSend | null> {
  let saved: CampusSend | null = null;
  await updateJson<CampusSend[]>(PATH, [], (list) => {
    saved = null;
    const at = list.findIndex((s) => s.id === id);
    if (at < 0) return NO_CHANGE;
    const next = fn(list[at]);
    if (!next) return NO_CHANGE;
    saved = next;
    const copy = [...list];
    copy[at] = next;
    return copy;
  });
  return saved;
}

export const cancelSend = (id: string) => change(id, (s) => (s.status === "scheduled" ? { ...s, status: "cancelled" } : null));
export const stopReminders = (id: string) => change(id, (s) => ({ ...s, remindEveryDays: 0 }));

/** Where the email's button goes for a portal user. */
const userPath = (kind: ShareKind, id: string) =>
  kind === "module" ? `/campus#module-${id}` : kind === "material" ? `/campus/material/${id}` : `/campus/tests/${id}`;

interface Catalogue {
  modules: TrainingModule[];
  materials: Material[];
  tests: Test[];
}
const loadCatalogue = async (): Promise<Catalogue> => {
  const [modules, materials, tests] = await Promise.all([getModules(), getMaterials(), getTests()]);
  return { modules, materials, tests };
};

/** Is the thing sent still there and published? */
function targetLive(send: CampusSend, c: Catalogue): boolean {
  const list: { id: string; status: string }[] = send.kind === "module" ? c.modules : send.kind === "material" ? c.materials : c.tests;
  return list.some((x) => x.id === send.targetId && x.status === "published");
}

/** Has this person finished it? */
function isDone(send: CampusSend, progress: Progress, c: Catalogue): boolean {
  if (send.kind === "material") return Boolean(progress.opened[send.targetId]);
  if (send.kind === "test") return hasPassed(progress, send.targetId);
  const live = liveKeys(c.materials, c.tests);
  const mod = c.modules.find((m) => m.id === send.targetId);
  const steps = (mod?.items ?? []).filter((i) => live.has(`${i.kind}:${i.id}`));
  return steps.length > 0 && steps.every((i) => (i.kind === "material" ? Boolean(progress.opened[i.id]) : hasPassed(progress, i.id)));
}

async function deliver(send: CampusSend, people: Recipient[], reminder: boolean): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const subject = reminder ? `Reminder: ${send.subject}` : send.subject;
  for (const [i, r] of people.entries()) {
    if (i > 0) await sleep(600);
    const path = r.userId ? userPath(send.kind, send.targetId) : `/s/${send.shareToken}`;
    const ok = await sendCampusEmail(r.email, r.name, subject, send.message, send.title, path, reminder).catch(() => false);
    if (ok) sent++;
    else failed++;
  }
  return { sent, failed };
}

/** Sends it now: works out who, makes the share link for typed addresses, emails everyone. */
export async function sendNow(id: string): Promise<CampusSend | null> {
  // Claimed first, so the daily job and a "send now" cannot both send it.
  const claimed = await change(id, (s) => (s.status === "scheduled" ? { ...s, status: "sending", claimedAt: new Date().toISOString() } : null));
  if (!claimed) return null;
  // Unpublished or deleted since it was scheduled: nobody is sent a dead link.
  if (!targetLive(claimed, await loadCatalogue())) {
    return change(id, (s) => ({ ...s, status: "cancelled", note: "The training is no longer published." }));
  }
  const all = await getUsers();
  const users = all.filter((u) => !u.retiredAt && !u.termLocked && u.email);
  const chosen = claimed.everyone ? users : users.filter((u) => claimed.userIds.includes(u.id));
  const recipients: Recipient[] = chosen.map((u) => ({ email: u.email, name: `${u.name} ${u.surname}`.trim(), userId: u.id }));
  // Every login's address, INCLUDING locked and retired members: typing one of
  // theirs as an outside address must not hand them a way back in by link.
  const known = new Set(all.map((u) => u.email.toLowerCase()));
  const external = claimed.externalEmails.filter((e) => !known.has(e.toLowerCase()));
  let shareToken = claimed.shareToken;
  if (external.length && !shareToken) {
    shareToken = (await createShareLink(claimed.kind, claimed.targetId, `Email: ${claimed.subject}`.slice(0, 120), "", claimed.createdBy)).token;
  }
  for (const e of external) recipients.push({ email: e, name: "" });
  recipients.splice(MAX_RECIPIENTS);
  // Who it goes to is saved BEFORE sending, so a send stopped part way still
  // has its people on record (for reminders) once it is closed off.
  await change(id, (s) => ({ ...s, shareToken, recipients }));
  const { sent, failed } = await deliver({ ...claimed, shareToken, recipients }, recipients, false);
  const done = await change(id, (s) => ({ ...s, status: "sent", sentAt: new Date().toISOString(), sentCount: sent, failedCount: failed, lastRemindedOn: todaySast() }));
  await recordActivity({
    actorName: claimed.createdByName,
    actorId: claimed.createdBy,
    action: "training.sent",
    entity: "training",
    entityId: claimed.targetId,
    summary: `Campus: sent "${claimed.title}" to ${sent} ${sent === 1 ? "person" : "people"}${failed ? `, ${failed} failed` : ""}`,
  });
  return done;
}

/** Reminds whoever has not finished, if a reminder is due today. Returns how many were emailed. */
async function remindIfDue(send: CampusSend, today: string): Promise<number> {
  if (send.status !== "sent" || !send.remindEveryDays || send.remindersSent >= send.remindMax) return 0;
  const from = send.lastRemindedOn ?? send.sentAt?.slice(0, 10) ?? today;
  if (addDays(from, send.remindEveryDays) > today) return 0;
  const catalogue = await loadCatalogue();
  if (!targetLive(send, catalogue)) return 0;
  // Claimed: the day's reminder is recorded BEFORE sending, so a second run that day sends nothing.
  const claimed = await change(send.id, (s) => (s.lastRemindedOn === today ? null : { ...s, lastRemindedOn: today, remindersSent: s.remindersSent + 1 }));
  if (!claimed) return 0;

  const [guests, users] = await Promise.all([send.shareToken ? getGuests(send.shareToken) : [], getUsers()]);
  const recipients = send.recipients ?? [];
  // Done by ANY guest who gave this address on the link (a guest may join more than once).
  const doneFlags = await Promise.all(
    recipients.map(async (r) => {
      if (r.userId) return isDone(send, await getProgress(r.userId), catalogue);
      const mine = guests.filter((g) => g.email === r.email.toLowerCase());
      const progresses = await Promise.all(mine.map((g) => getProgress(guestProgressId(g.id))));
      return progresses.some((p) => isDone(send, p, catalogue));
    })
  );
  // Somebody locked out or retired since is not chased.
  const blocked = new Set(users.filter((u) => u.retiredAt || u.termLocked).map((u) => u.id));
  const chase = recipients.filter((r, i) => !doneFlags[i] && (!r.userId || !blocked.has(r.userId)));
  if (chase.length) await deliver(send, chase, true);
  return chase.length;
}

// A send left in "sending" this long was stopped part way; it is closed off as sent.
const STUCK_MS = 30 * 60 * 1000;

/**
 * The daily job: scheduled sends that are due, then reminders. Lines for the
 * run log. Stops starting new work after `budgetMs`, because every school
 * shares one daily run; anything left goes on the next run.
 */
export async function runCampusSends(today = todaySast(), budgetMs = 90_000): Promise<string[]> {
  const lines: string[] = [];
  const stopAt = Date.now() + budgetMs;
  for (const s of await getSends()) {
    if (Date.now() > stopAt) {
      lines.push("Campus: more sends waiting, they go on the next run");
      break;
    }
    try {
      if (s.status === "sending" && s.claimedAt && Date.now() - Date.parse(s.claimedAt) > STUCK_MS) {
        await change(s.id, (x) =>
          x.status === "sending"
            ? { ...x, status: "sent", sentAt: x.claimedAt, note: "Stopped part way: some people may not have been emailed.", lastRemindedOn: x.claimedAt!.slice(0, 10) }
            : null
        );
        lines.push(`Campus: "${s.title}" was stopped part way and has been closed off`);
      } else if (s.status === "scheduled" && s.sendOn <= today) {
        const done = await sendNow(s.id);
        if (done) lines.push(done.status === "cancelled" ? `Campus: "${s.title}" not sent, no longer published` : `Campus: sent "${s.title}" to ${done.sentCount ?? 0}`);
      } else {
        const n = await remindIfDue(s, today);
        if (n) lines.push(`Campus: reminded ${n} about "${s.title}"`);
      }
    } catch (err) {
      lines.push(`Campus send "${s.title}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return lines;
}
