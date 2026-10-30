// Checks the SGB term rules: who is exempt, when the lock is due, who it
// catches, and what blocks a sign-in. No server, no blob.
//
//   npx tsx scripts/check-governance-term.ts
import assert from "node:assert/strict";
import { accessBlocked, exemptReason, headsByLink, lockDue, termDatesProblem, todaySast, usersToLock } from "../lib/governanceTerm";

const people = [
  { position: "Principal", userId: "p1", email: "head@school.za" },
  { position: "Deputy Principal", userId: null, email: "Deputy@School.za " },
  { position: "SGB Chairperson", userId: "c1", email: "chair@school.za" },
  { position: "Head of School / Principal", userId: "h1", email: "" },
];
const u = (id: string, email: string, extra: object = {}) => ({ id, email, role: "sgb-member", ...extra });

// Exempt only by the tick (set by a term manager) or Super Admin, never by the register alone.
assert.equal(exemptReason(u("p1", "head@school.za")), null, "a register position alone does not exempt");
assert.equal(exemptReason(u("s1", "s@x", { role: "super-admin" })), "Super Admin");
assert.equal(exemptReason(u("b1", "b@x", { keepsAccessAfterTerm: true })), "Keeps access");
// The heads are found by the register's LINK to the login, not by a typed email.
assert.equal(headsByLink(u("p1", "x@x"), people), true, "linked Principal");
assert.equal(headsByLink(u("h1", "h@x"), people), true, "independent school's head");
assert.equal(headsByLink(u("d1", "deputy@school.za"), people), false, "an email match is not enough: anyone with People access could type one in");
assert.equal(headsByLink(u("c1", "chair@school.za"), people), false, "the chair is not a head");

const term = { id: "t", startDate: "2024-04-01", endDate: "2027-03-31" };
assert.equal(lockDue(term, "2027-03-31"), false, "the last day of the term is still in the term");
assert.equal(lockDue(term, "2027-04-01"), true, "locked from the day after");
assert.equal(lockDue({ ...term, lockedAt: "2027-04-01T05:00:00Z" }, "2027-04-02"), false, "runs once per term");
assert.equal(lockDue(null, "2030-01-01"), false, "no term set, nothing happens");

const users = [
  u("p1", "head@school.za"),
  u("c1", "chair@school.za"),
  u("m1", "m@x"),
  u("r1", "r@x", { retiredAt: "2026-01-01" }),
  u("l1", "l@x", { termLocked: true }),
  u("b1", "b@x", { keepsAccessAfterTerm: true }),
];
assert.deepEqual(usersToLock(users).map((x) => x.id), ["p1", "c1", "m1"], "everyone not ticked, not retired, not already locked (an unticked Principal too)");

assert.equal(accessBlocked(u("a", "a@x")), null);
assert.equal(accessBlocked(u("a", "a@x", { termLocked: true })), "term_ended");
assert.equal(accessBlocked(u("a", "a@x", { retiredAt: "2026-01-01", termLocked: true })), "retired");

const today = "2026-10-30";
assert.equal(termDatesProblem("2024-04-01", "2027-03-31", today), null);
assert.match(termDatesProblem("2027-03-31", "2024-04-01", today)!, /after it starts/);
assert.match(termDatesProblem("1 April", "2027-03-31", today)!, /dates/);
assert.match(termDatesProblem("2026-01-01", "2026-13-45", today)!, /dates/, "an impossible date is refused, not thrown");
assert.match(termDatesProblem("2026-02-30", "2027-03-31", today)!, /dates/, "30 February is refused");
assert.match(termDatesProblem("2022-04-01", "2025-03-31", today)!, /already passed/, "a past end date would lock everyone at once");
assert.equal(todaySast(new Date("2026-10-30T22:30:00Z")), "2026-10-31", "after 22:00 UTC it is already tomorrow in South Africa");

console.log("governance term: all checks passed");
