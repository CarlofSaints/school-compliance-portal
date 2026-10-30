import { randomUUID } from "crypto";
import { readJson, updateJson, NO_CHANGE } from "./controlData";
import { getUsers, updateUser, updateUsersWhere, type User } from "./userData";
import { getPeople } from "./peopleData";
import { tenantScope } from "./tenantContext";
import { recordActivity } from "./activityLog";
import { sendTermEndedEmail } from "./email";
import {
  EMPTY_TERMS,
  exemptReason,
  headsByLink,
  lockDue,
  positionsOf,
  todaySast,
  usersToLock,
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

// How often a sign-in may look at whether a term has ended (the daily job and
// the term page always look).
const CHECK_EVERY_MS = 10 * 60 * 1000;
const lastCheck = new Map<string, number>();

/**
 * Locks every member who is not exempt once the current term has ended, then
 * emails the Principal and Deputy the list. The run is CLAIMED first (lockedAt
 * set under a guarded write), so two runs at once cannot both lock, and the
 * lock itself is one guarded write over users.json that decides from the
 * accounts as they are at that moment, so nobody switched back on is locked
 * again. Returns the ids locked by THIS call.
 */
export async function applyTermLockIfDue(opts: { force?: boolean } = {}): Promise<Set<string>> {
  const none = new Set<string>();
  const { key } = await tenantScope();
  if (!opts.force && Date.now() - (lastCheck.get(key) ?? 0) < CHECK_EVERY_MS) return none;
  lastCheck.set(key, Date.now());

  const terms = await getTerms();
  if (!lockDue(terms.current, todaySast())) return none;
  const term = terms.current;

  let claimed = false;
  const claimedAt = new Date().toISOString();
  await updateJson<TermSettings>(PATH, EMPTY_TERMS, (t) => {
    claimed = false;
    if (!t.current || t.current.id !== term.id || t.current.lockedAt) return NO_CHANGE;
    claimed = true;
    return { ...t, current: { ...t.current, lockedAt: claimedAt } };
  });
  if (!claimed) return none;

  let lockedIds: string[];
  try {
    lockedIds = await updateUsersWhere((u) => (usersToLock([u]).length ? { termLocked: true } : null));
  } catch (err) {
    // Give the claim back so the next run tries again.
    await updateJson<TermSettings>(PATH, EMPTY_TERMS, (t) =>
      t.current?.id === term.id && t.current.lockedAt === claimedAt ? { ...t, current: { ...t.current, lockedAt: undefined } } : NO_CHANGE
    ).catch(() => {});
    throw err;
  }
  await updateJson<TermSettings>(PATH, EMPTY_TERMS, (t) =>
    t.current?.id === term.id ? { ...t, current: { ...t.current, lockedCount: lockedIds.length } } : NO_CHANGE
  ).catch(() => {});

  const [users, people] = await Promise.all([getUsers(), getPeople()]);
  const locked = users.filter((u) => lockedIds.includes(u.id));
  await recordActivity({
    actorName: "System",
    action: "term.ended",
    entity: "user",
    summary: `Term ended ${term.endDate}: ${locked.length} member${locked.length === 1 ? "" : "s"} locked out until switched back on`,
    detail: { termId: term.id, locked: locked.map((u) => u.email) },
  });
  for (const h of users.filter((u) => headsByLink(u, people) && u.email && !u.termLocked && !u.retiredAt)) {
    await sendTermEndedEmail(h.email, h.name, term.endDate, locked.map((u) => `${u.name} ${u.surname}`.trim())).catch((err) =>
      console.error("[term] email to", h.email, "failed:", err)
    );
  }
  return new Set(lockedIds);
}

/**
 * When a term is set, the Principal and Deputy (linked to their logins on the
 * People register) are ticked to keep access. A manager's action, logged by the
 * caller; anybody else can be ticked by hand.
 */
export async function keepHeadsOn(): Promise<string[]> {
  const people = await getPeople();
  return updateUsersWhere((u) => (headsByLink(u, people) && !u.keepsAccessAfterTerm ? { keepsAccessAfterTerm: true } : null));
}

export type TermAction = "switch_on" | "retire" | "keep_access" | "no_keep_access";

/** What the Principal does to one member after a term ends. */
export async function setMemberState(userId: string, action: TermAction): Promise<User | null> {
  const change: Partial<User> =
    action === "switch_on"
      ? { termLocked: false, retiredAt: undefined }
      : action === "retire"
        ? { retiredAt: new Date().toISOString(), termLocked: false }
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
    exempt: exemptReason(u),
    superAdmin: u.role === "super-admin",
    keepsAccessAfterTerm: Boolean(u.keepsAccessAfterTerm),
    termLocked: Boolean(u.termLocked),
    retiredAt: u.retiredAt ?? null,
  }));
}

export type { GovernanceTerm };
