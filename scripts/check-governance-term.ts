// Checks the SGB term rules: who is exempt, when the lock is due, who it
// catches, and what blocks a sign-in. No server, no blob.
//
//   npx tsx scripts/check-governance-term.ts
import assert from "node:assert/strict";
import { accessBlocked, exemptReason, lockDue, termDatesProblem, todaySast, usersToLock } from "../lib/governanceTerm";

const people = [
  { position: "Principal", userId: "p1", email: "head@school.za" },
  { position: "Deputy Principal", userId: null, email: "Deputy@School.za " },
  { position: "SGB Chairperson", userId: "c1", email: "chair@school.za" },
  { position: "Head of School / Principal", userId: "h1", email: "" },
];
const u = (id: string, email: string, extra: object = {}) => ({ id, email, role: "sgb-member", ...extra });

assert.equal(exemptReason(u("p1", "x@x"), people), "Principal", "linked by the register's user link");
assert.equal(exemptReason(u("d1", "deputy@school.za"), people), "Deputy Principal", "linked by email, any case and spaces");
assert.equal(exemptReason(u("h1", "h@x"), people), "Head of School / Principal", "independent school's head");
assert.equal(exemptReason(u("c1", "chair@school.za"), people), null, "the chair is locked like everyone else");
assert.equal(exemptReason(u("s1", "s@x", { role: "super-admin" }), people), "Super Admin");
assert.equal(exemptReason(u("b1", "b@x", { keepsAccessAfterTerm: true }), people), "Keeps access");

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
assert.deepEqual(usersToLock(users, people).map((x) => x.id), ["c1", "m1"], "everyone not exempt, not retired, not already locked");

assert.equal(accessBlocked(u("a", "a@x")), null);
assert.equal(accessBlocked(u("a", "a@x", { termLocked: true })), "term_ended");
assert.equal(accessBlocked(u("a", "a@x", { retiredAt: "2026-01-01", termLocked: true })), "retired");

assert.equal(termDatesProblem("2024-04-01", "2027-03-31"), null);
assert.match(termDatesProblem("2027-03-31", "2024-04-01")!, /after it starts/);
assert.match(termDatesProblem("1 April", "2027-03-31")!, /dates/);
assert.equal(todaySast(new Date("2026-10-30T22:30:00Z")), "2026-10-31", "after 22:00 UTC it is already tomorrow in South Africa");

console.log("governance term: all checks passed");
