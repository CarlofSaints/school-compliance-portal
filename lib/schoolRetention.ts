import type { Tenant } from "./tenant";

// The Terms (clause 8) and Refunds (clause 4) promise: stop paying, we keep
// the data 90 days, then delete it. POPIA s14 holds us to it.
//
// 🔴 Deletion is never automatic. A school's records are the school's, and
// one wrong status must not wipe a register. On day 90 the morning run emails
// School Compliance; a person deletes from /platform/<key>, typing the key.
export const RETENTION_DAYS = 90;
const DAY = 86_400_000;

export function deletionDueOn(t: Pick<Tenant, "status" | "suspendedAt">): Date | null {
  if (t.status !== "suspended" || !t.suspendedAt) return null;
  const at = Date.parse(t.suspendedAt);
  return Number.isNaN(at) ? null : new Date(at + RETENTION_DAYS * DAY);
}

/** On the day it falls due, then once a week until somebody acts. */
export function remindToday(t: Pick<Tenant, "status" | "suspendedAt">, now = new Date()): boolean {
  const due = deletionDueOn(t);
  if (!due || now < due) return false;
  return Math.floor((now.getTime() - due.getTime()) / DAY) % 7 === 0;
}
