// Meeting types (Admin, Minutes Admin, Meeting types).
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-meeting-types.ts
import assert from "node:assert/strict";
import { withBuiltIns, meetingTypeLabel } from "../lib/meetingTypes";
import {
  getMeetingTypes,
  addMeetingType,
  renameMeetingType,
  removeMeetingType,
  isMeetingTypeId,
} from "../lib/meetingTypesData";
import { createMinutes } from "../lib/minutesData";
import { canonicalMinutes, audienceForBody } from "../lib/minutes";

async function main() {
  // Built-ins always there, junk dropped, a renamed built-in keeps its id.
  const list = withBuiltIns([{ id: "sgb", label: " SGB " }, { id: 5 }, { id: "mt-1", label: "AGM" }, { id: "mt-1", label: "dup" }]);
  assert.deepEqual(list.map((t) => t.id), ["sgb", "fincom", "other", "mt-1"]);
  assert.equal(meetingTypeLabel(list, "sgb"), "SGB");
  assert.equal(meetingTypeLabel(list, "gone"), "gone");

  // Add, refuse a duplicate name (any case), rename a built-in.
  const added = await addMeetingType("AGM");
  const agm = added.find((t) => t.label === "AGM")!;
  assert.ok(agm && agm.id.startsWith("mt-"));
  await assert.rejects(addMeetingType(" agm "));
  await assert.rejects(addMeetingType("   "));
  await renameMeetingType("sgb", "SGB");
  assert.equal(meetingTypeLabel(await getMeetingTypes(), "sgb"), "SGB");
  await assert.rejects(renameMeetingType("sgb", "agm"));
  assert.equal(await isMeetingTypeId(agm.id), true);
  assert.equal(await isMeetingTypeId("made-up"), false);

  // Built-ins can never be removed.
  await assert.rejects(removeMeetingType("fincom"));

  // AGM minutes go to the SGB list, and renaming a type leaves the signed
  // wording (what a signature is bound to) exactly as it was.
  assert.equal(audienceForBody(agm.id), "sgb");
  const m = await createMinutes({
    title: "AGM 2026",
    body: agm.id,
    period: { kind: "month", year: 2026, month: 11 },
    sections: [],
  } as unknown as Parameters<typeof createMinutes>[0]);
  const before = canonicalMinutes(m);
  await renameMeetingType(agm.id, "Annual General Meeting");
  assert.equal(canonicalMinutes(m), before);

  // In use, so it cannot be removed; an unused one can.
  await assert.rejects(removeMeetingType(agm.id), /still used/);
  const spare = (await addMeetingType("EXCO")).find((t) => t.label === "EXCO")!;
  const after = await removeMeetingType(spare.id);
  assert.ok(!after.some((t) => t.id === spare.id));

  console.log("check-meeting-types: all passed");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
