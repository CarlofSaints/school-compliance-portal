// Runs the end-of-term lock against the FAKE store: who gets locked, that it
// runs once, and that a member switched back on is not locked again.
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-term-lock.ts
import assert from "node:assert/strict";
import { createUser, getUserById } from "../lib/userData";
import { savePeople } from "../lib/peopleData";
import { applyTermLockIfDue, keepHeadsOn, saveTerm, setMemberState } from "../lib/governanceTermData";

const mk = (id: string, role = "sgb-member") =>
  createUser({ id, name: id, surname: "Test", email: `${id}@test.example`, password: "x".repeat(20), role, forcePasswordChange: false });

(async () => {
  await Promise.all([mk("head"), mk("chair"), mk("member"), mk("boss", "super-admin")]);
  await savePeople([
    { id: "p1", position: "Principal", userId: "head", name: "Head", email: "head@test.example", phone: "", profilePic: "" },
    // Written in by email only: must NOT be treated as a head.
    { id: "p2", position: "Deputy Principal", userId: null, name: "Chair", email: "chair@test.example", phone: "", profilePic: "" },
  ]);
  assert.deepEqual(await keepHeadsOn(), ["head"], "only the Principal linked BY LOGIN is ticked");

  await saveTerm("2023-04-01", "2026-03-31", "new"); // already over
  const locked = await applyTermLockIfDue({ force: true });
  assert.deepEqual([...locked].sort(), ["chair", "member"], "everyone but the ticked Principal and the Super Admin");
  assert.equal((await applyTermLockIfDue({ force: true })).size, 0, "the lock runs once per term");

  await setMemberState("chair", "switch_on");
  assert.equal((await applyTermLockIfDue({ force: true })).size, 0);
  assert.equal((await getUserById("chair"))?.termLocked, false, "switched back on stays on");
  await setMemberState("member", "retire");
  const m = await getUserById("member");
  assert.ok(m?.retiredAt && !m.termLocked, "retired");
  assert.equal(await saveTerm("2026-04-01", "2029-03-31", "edit"), "locked", "a locked term's dates cannot be moved; start a new one");
  console.log("term lock: all checks passed");
})();
