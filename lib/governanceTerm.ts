import { PRIVATE_POSITIONS, PUBLIC_POSITIONS } from "./positions";
import { SUPER_ADMIN_ROLE_ID } from "./roles";

// ---------------------------------------------------------------------------
// SGB (or board) terms. Carl, 30 Oct 2026: when a term ends, every member is
// locked out except the Principal and Deputy Principal; the Principal then
// switches re-elected members back on and retires the ones not continuing.
//
// Pure (no storage), so scripts/check-governance-term.ts can test it. Storage
// and the lock itself are lib/governanceTermData.ts.
//
// Who is never locked:
// - a Super Admin, or nobody would be left who can run the portal;
// - anybody ticked "Keeps access when a term ends". Setting a term ticks the
//   Principal and Deputy Principal (Head / Deputy Head at an independent
//   school) automatically, found by the People register's LINK to their login;
//   a manager can tick others (staff who are not governors, e.g. the bursar).
//
// 🔴 Authority is the TICK, set by a term manager, never the register on its
// own: anybody who can edit People could otherwise write themselves in as
// "Principal" and keep their access, or gain the right to retire others.
// ---------------------------------------------------------------------------

export const TERM_EXEMPT_POSITIONS = [PUBLIC_POSITIONS[0], PUBLIC_POSITIONS[1], PRIVATE_POSITIONS[0], PRIVATE_POSITIONS[1]];

export interface GovernanceTerm {
  id: string;
  /** YYYY-MM-DD, inclusive. */
  startDate: string;
  /** YYYY-MM-DD, the last day of the term. Members are locked from the day after. */
  endDate: string;
  /** When the end-of-term lock was applied. Set once. */
  lockedAt?: string;
  lockedCount?: number;
}

export interface TermSettings {
  current: GovernanceTerm | null;
  past: GovernanceTerm[];
}

export const EMPTY_TERMS: TermSettings = { current: null, past: [] };

export interface TermUser {
  id: string;
  email: string;
  role: string;
  termLocked?: boolean;
  retiredAt?: string;
  keepsAccessAfterTerm?: boolean;
}
export interface TermPerson {
  position: string;
  userId: string | null;
  email: string;
}

const norm = (e: string) => e.trim().toLowerCase();

/** The register positions this login holds (shown on the term page; by link or by email). */
export function positionsOf(user: TermUser, people: TermPerson[]): string[] {
  return people.filter((p) => p.userId === user.id || (p.email && norm(p.email) === norm(user.email))).map((p) => p.position);
}

/** Principal / Deputy by the register's LINK to this login only (an email match is too easy to write in). */
export const headsByLink = (user: TermUser, people: TermPerson[]) =>
  people.some((p) => p.userId === user.id && TERM_EXEMPT_POSITIONS.includes(p.position));

/** Why this person is never locked by a term ending, or null if they are. */
export function exemptReason(user: TermUser): "Super Admin" | "Keeps access" | null {
  if (user.role === SUPER_ADMIN_ROLE_ID) return "Super Admin";
  if (user.keepsAccessAfterTerm) return "Keeps access";
  return null;
}

/** The end-of-term lock is due: a term ended before today and has not been applied. */
export function lockDue(term: GovernanceTerm | null, today: string): term is GovernanceTerm {
  return Boolean(term && !term.lockedAt && term.endDate < today);
}

/** Who the lock catches: everyone not exempt, not already retired, not already locked. */
export function usersToLock<U extends TermUser>(users: U[]): U[] {
  return users.filter((u) => !u.retiredAt && !u.termLocked && !exemptReason(u));
}

/** Whether this account may sign in and use the portal. */
export function accessBlocked(user: TermUser): "retired" | "term_ended" | null {
  if (user.retiredAt) return "retired";
  if (user.termLocked) return "term_ended";
  return null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** A real calendar date (2026-13-45 is not). */
const realDate = (d: string) => {
  const t = Date.parse(`${d}T00:00:00Z`);
  return DATE.test(d) && !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
};
/** Why a term's dates are not usable, or null. An end date already past would lock everyone at once. */
export function termDatesProblem(start: unknown, end: unknown, today: string): string | null {
  if (typeof start !== "string" || typeof end !== "string" || !realDate(start) || !realDate(end)) {
    return "Give the start and end dates.";
  }
  if (end <= start) return "The term must end after it starts.";
  if (end < today) return "The end date has already passed. Check the year.";
  return null;
}

/** Today in South Africa (UTC+2, no daylight saving), as YYYY-MM-DD. */
export const todaySast = (now = new Date()) => new Date(now.getTime() + 2 * 3600_000).toISOString().slice(0, 10);
