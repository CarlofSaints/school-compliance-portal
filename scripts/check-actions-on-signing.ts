// Actions raised from minutes: held until the minutes are signed, then one
// email per person; deleting one tells exactly the people who were told.
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-actions-on-signing.ts
import assert from "node:assert/strict";
import { createMinutes, updateMinutes, getMinutes } from "../lib/minutesData";
import { createActionItem, getActionItemById, updateActionItem } from "../lib/actionItemData";
import { savePeople } from "../lib/peopleData";
import { heldForSigning, notifyAssignees, notifyRemoved } from "../lib/actionItemNotify";
import { tellAssigneesAtSigning } from "../lib/minutesDistribution";
import type { ActionItem } from "../lib/actionItems";

// No email key here, so a send is logged as "[Email] Would send to <addr>: <subject>".
const sent: string[] = [];
const log = console.log;
console.log = (...a: unknown[]) => {
  const m = /^\[Email\] Would send to (\S+): (.*)$/.exec(String(a[0]));
  if (m) sent.push(`${m[1]} | ${m[2]}`);
  else if (!String(a[0]).startsWith("[Email]")) log(...a);
};

async function main() {
  await savePeople([
    { id: "p-graham", position: "Maintenance", userId: null, name: "Graham", email: "graham@x.example", phone: "", profilePic: "" },
    { id: "p-dee", position: "Governor", userId: null, name: "Dee", email: "dee@x.example", phone: "", profilePic: "" },
  ]);
  const m = await createMinutes({ title: "Term 4", body: "sgb", period: { kind: "month", year: 2026, month: 11 }, sections: [] } as unknown as Parameters<typeof createMinutes>[0]);
  const base = (title: string, assigneeIds: string[]): Omit<ActionItem, "ref"> => ({
    id: crypto.randomUUID(), title, description: "", assigneeIds, assigneeNames: [], category: "general", priority: "medium",
    dueDate: "", status: "not_started", progress: 0, updates: [], reminder: { enabled: true, daysBefore: 3, repeatEveryDays: 7, recipients: ["assignees"] },
    fromMinutes: { minutesId: m.id, minutesTitle: "Term 4", minutesPeriod: "November 2026" },
    raisedById: "u", raisedByName: "Carl", createdAt: "", updatedAt: "",
  } as unknown as Omit<ActionItem, "ref">);
  const a1 = await createActionItem(base("Paint the hall", ["p-graham"]));
  const a2 = await createActionItem(base("Fix the gate", ["p-graham", "p-dee"]));

  // Unsigned: held. No assignment email, nothing recorded as told.
  assert.equal(await heldForSigning(a1), true);
  assert.equal(await notifyAssignees(a1), 0);
  assert.equal(sent.length, 0);
  assert.deepEqual((await getActionItemById(a1.id))?.notifiedIds, [], "a new action starts with nobody told");

  // A scan with only some signatures does NOT release the hold.
  await updateMinutes(m.id, { signedCopy: { filename: "s.pdf", contentType: "application/pdf", size: 1, uploadedAt: "", uploadedBy: "", documentHash: "" } } as never);
  assert.equal(await heldForSigning(a1), true);

  // An action from BEFORE this change (no notifiedIds) was emailed at assignment:
  // its assignees count as told, so signing does not email them again.
  const legacy = await createActionItem({ ...base("Old one", ["p-graham"]) });
  await updateActionItem(legacy.id, () => ({ notifiedIds: undefined }));

  // Deleting a held action tells nobody (nobody was told it existed).
  assert.equal(await notifyRemoved((await getActionItemById(a1.id))!, "Carl"), 0);

  // Signed: Dee was on the signed-minutes list (already has her list); Graham
  // was not, so he gets ONE email with BOTH his actions.
  await updateMinutes(m.id, { status: "signed", signedAt: new Date().toISOString() });
  assert.equal(await heldForSigning(a1), false);
  const n = await tellAssigneesAtSigning((await getMinutes(m.id))!, new Set(["dee@x.example"]));
  assert.equal(n, 1);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /^graham@x\.example \| Your 2 actions from Term 4$/);
  assert.deepEqual((await getActionItemById(a2.id))?.notifiedIds?.sort(), ["p-dee", "p-graham"]);

  // A second send (the button pressed again) tells nobody twice.
  assert.equal(await tellAssigneesAtSigning((await getMinutes(m.id))!, new Set()), 0);
  assert.equal(sent.length, 1);

  // Deleting now tells exactly the people told: Graham and Dee for a2.
  sent.length = 0;
  assert.equal(await notifyRemoved((await getActionItemById(a2.id))!, "Carl"), 2);
  assert.ok(sent.every((s) => / \| Removed: action /.test(s)));

  console.log = log;
  console.log("check-actions-on-signing: all passed");
}
main().catch((e) => {
  console.log = log;
  console.error(e);
  process.exit(1);
});
