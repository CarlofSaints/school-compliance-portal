import { randomUUID } from "crypto";
import { readJson, updateJson, NO_CHANGE } from "./controlData";
import { getUsers, updateUser, type User } from "./userData";
import { getPeople } from "./peopleData";
import { tenantScope } from "./tenantContext";
import { recordActivity } from "./activityLog";
import { sendTermEndedEmail } from "./email";
import {
  EMPTY_TERMS,
  exemptReason,
  lockDue,
  positionsOf,
  todaySast,
  usersToLock,
  TERM_EXEMPT_POSITIONS,
  type GovernanceTerm,
  type TermSettings,
} from "./governanceTerm";

const PATH = "settings/governance-terms.json";

export const getTerms = () => readJson<TermSettings>(PATH, EMPTY_TERMS);

/** Sets the dates of the current term, or starts a NEW one (the old one goes to the history). */
export async function saveTerm(startDate: string, endDate: string, mode: "edit" | "new"): Promise<TermSettings | "locked"> {
  let refused = false;
  const saved = await updateJson<TermSettings>(PATH, EMPTY_TERMS, (t) => {
    if (mode === "edit" && t.current) {
      // Once the lock has run, moving the end date cannot undo it: start the next term instead.
      if (t.current.lockedAt) {
        refused = true;
        return NO_CHANGE;
      }
      return { ...t, current: { ...t.current, startDate, endDate } };
    }
    return { current: { id: randomUUID(), startDate, endDate }, past: t.current ? [t.current, ...t.past] : t.past };
  });
  return refused ? "locked" : saved;
}

// How often a request may look at whether a term has ended. The look is one
// small read; the lock itself runs once per term.
const CHECK_EVERY_MS = 10 * 60 * 1000;
const lastCheck = new Map<string, number>();

/**
 * Locks every member who is not exempt once the current term has ended, then
 * emails the Principal and Deputy the list. Safe to call from anywhere and at
 * the same time: locking skips anybody already locked, and only the call that
 * records the lock sends the email. True when it locked anyone just now.
 */
export async function applyTermLockIfDue(opts: { force?: boolean } = {}): Promise<boolean> {
  const { key } = await tenantScope();
  if (!opts.force && Date.now() - (lastCheck.get(key) ?? 0) < CHECK_EVERY_MS) return false;
  lastCheck.set(key, Date.now());

  const terms = await getTerms();
  if (!lockDue(terms.current, todaySast())) return false;
  const term = terms.current;

  const [users, people] = await Promise.all([getUsers(), getPeople()]);
  const toLock = usersToLock(users, people);
  for (const u of toLock) await updateUser(u.id, { termLocked: true });

  let recorded = false;
  await updateJson<TermSettings>(PATH, EMPTY_TERMS, (t) => {
    if (!t.current || t.current.id !== term.id || t.current.lockedAt) return NO_CHANGE;
    recorded = true;
    return { ...t, current: { ...t.current, lockedAt: new Date().toISOString(), lockedCount: toLock.length } };
  });
  if (!recorded) return toLock.length > 0;

  await recordActivity({
    actorName: "System",
    action: "term.ended",
    entity: "user",
    summary: `Term ended ${term.endDate}: ${toLock.length} member${toLock.length === 1 ? "" : "s"} locked out until switched back on`,
    detail: { termId: term.id, locked: toLock.map((u) => u.email) },
  });
  const heads = users.filter((u) => positionsOf(u, people).some((p) => TERM_EXEMPT_POSITIONS.includes(p)) && u.email);
  for (const h of heads) {
    await sendTermEndedEmail(h.email, h.name, term.endDate, toLock.map((u) => `${u.name} ${u.surname}`.trim())).catch((err) =>
      console.error("[term] email to", h.email, "failed:", err)
    );
  }
  return toLock.length > 0;
}

export type TermAction = "switch_on" | "retire" | "unretire" | "keep_access" | "no_keep_access";

/** What the Principal does to one member after a term ends. */
export async function setMemberState(userId: string, action: TermAction): Promise<User | null> {
  const change: Partial<User> =
    action === "switch_on"
      ? { termLocked: false, retiredAt: undefined }
      : action === "retire"
        ? { retiredAt: new Date().toISOString(), termLocked: false }
        : action === "unretire"
          ? { retiredAt: undefined }
          : { keepsAccessAfterTerm: action === "keep_access" };
  return updateUser(userId, change);
}

/** Every login with where they stand, for the term page. */
export async function termRoster() {
  const [users, people] = await Promise.all([getUsers(), getPeople()]);
  return users.map((u) => ({
    id: u.id,
    name: `${u.name} ${u.surname}`.trim(),
    email: u.email,
    positions: positionsOf(u, people),
    exempt: exemptReason(u, people),
    keepsAccessAfterTerm: Boolean(u.keepsAccessAfterTerm),
    termLocked: Boolean(u.termLocked),
    retiredAt: u.retiredAt ?? null,
  }));
}

export type { GovernanceTerm };
