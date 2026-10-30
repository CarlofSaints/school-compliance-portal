import { randomUUID } from "crypto";
import { readJson, updateJson, addToList, NO_CHANGE } from "./controlData";
import { getUsers } from "./userData";
import { sendCampusEmail } from "./email";
import { recordActivity } from "./activityLog";
import { createShareLink, getGuests, guestProgressId, type ShareKind } from "./campusShare";
import { getMaterials, getModules, getProgress, getTests } from "./trainingData";
import { hasPassed, liveKeys, type Progress } from "./training";

// ---------------------------------------------------------------------------
// Campus emails: send a module, lesson or test to people, now or on a date,
// with optional reminders to whoever has not finished it. Runs on the existing
// daily job (07:00 SAST) for anything scheduled or due a reminder.
//
// - Recipients are FROZEN when it goes out (who was emailed), so a reminder
//   reaches the same people and nobody added later is nagged for something
//   they were never sent. Locked or retired members (term ended) are left out.
// - People without a portal account (typed addresses) get a share link made
//   for this send, so they can do it without signing in.
// - Done means: a lesson opened, a test passed, every published step of a
//   module done. Only people not done are reminded.
// - Sends are paced (Resend allows about two a second).
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
export const todaySast = () => new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
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

/** Has this person finished it? */
async function isDone(send: CampusSend, progress: Progress): Promise<boolean> {
  if (send.kind === "material") return Boolean(progress.opened[send.targetId]);
  if (send.kind === "test") return hasPassed(progress, send.targetId);
  const [modules, materials, tests] = await Promise.all([getModules(), getMaterials(), getTests()]);
  const live = liveKeys(materials, tests);
  const mod = modules.find((m) => m.id === send.targetId);
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
  const claimed = await change(id, (s) => (s.status === "scheduled" ? { ...s, status: "sending" } : null));
  if (!claimed) return null;
  const users = (await getUsers()).filter((u) => !u.retiredAt && !u.termLocked && u.email);
  const chosen = claimed.everyone ? users : users.filter((u) => claimed.userIds.includes(u.id));
  const recipients: Recipient[] = chosen.map((u) => ({ email: u.email, name: `${u.name} ${u.surname}`.trim(), userId: u.id }));
  const known = new Set(recipients.map((r) => r.email.toLowerCase()));
  const external = claimed.externalEmails.filter((e) => !known.has(e.toLowerCase()));
  let shareToken = claimed.shareToken;
  if (external.length && !shareToken) {
    shareToken = (await createShareLink(claimed.kind, claimed.targetId, `Email: ${claimed.subject}`.slice(0, 120), "", claimed.createdBy)).token;
  }
  for (const e of external) recipients.push({ email: e, name: "" });
  const withLink = { ...claimed, shareToken, recipients };
  const { sent, failed } = await deliver(withLink, recipients, false);
  const done = await change(id, (s) => ({ ...s, status: "sent", shareToken, recipients, sentAt: new Date().toISOString(), sentCount: sent, failedCount: failed, lastRemindedOn: todaySast() }));
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
  // Claimed: the day's reminder is recorded BEFORE sending, so a second run that day sends nothing.
  const claimed = await change(send.id, (s) => (s.lastRemindedOn === today ? null : { ...s, lastRemindedOn: today, remindersSent: s.remindersSent + 1 }));
  if (!claimed) return 0;
  const guests = send.shareToken ? await getGuests(send.shareToken) : [];
  const waiting: Recipient[] = [];
  for (const r of send.recipients ?? []) {
    const guest = r.userId ? undefined : guests.find((g) => g.email === r.email.toLowerCase());
    const progress = r.userId ? await getProgress(r.userId) : guest ? await getProgress(guestProgressId(guest.id)) : null;
    if (!progress || !(await isDone(send, progress))) waiting.push(r);
  }
  // Somebody locked out or retired since is not chased.
  const users = await getUsers();
  const blocked = new Set(users.filter((u) => u.retiredAt || u.termLocked).map((u) => u.id));
  const chase = waiting.filter((r) => !r.userId || !blocked.has(r.userId));
  if (chase.length) await deliver(send, chase, true);
  return chase.length;
}

/** The daily job: scheduled sends that are due, then reminders. Lines for the run log. */
export async function runCampusSends(today = todaySast()): Promise<string[]> {
  const lines: string[] = [];
  for (const s of await getSends()) {
    try {
      if (s.status === "scheduled" && s.sendOn <= today) {
        const done = await sendNow(s.id);
        if (done) lines.push(`Campus: sent "${s.title}" to ${done.sentCount ?? 0}`);
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
