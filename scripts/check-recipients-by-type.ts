// Who receives minutes, per meeting type (Admin, Minutes Admin, Who receives minutes).
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-recipients-by-type.ts
import assert from "node:assert/strict";
import { stageTags, type MinutesRecipientSettings } from "../lib/minutes";
import { effectiveAccess } from "../lib/minutesAccessRules";
import { writeJson } from "../lib/controlData";
import { saveRecipientSettingsFor, getRecipientSettings, resolveStage } from "../lib/minutesRecipients";
import { createTag } from "../lib/tagData";
import { savePeople } from "../lib/peopleData";

async function main() {
  // Old school-wide lists, nothing saved per type yet.
  const old: MinutesRecipientSettings = {
    to: { draft: "chk", signing: "sig", signed: "dead", sgb: "sgb", fincom: "fin" },
    cc: { draft: "dep", signing: "nope", sgb: "sgbcc", fincom: "fincc" },
  };
  // Every type follows them exactly as the sends did before this change.
  assert.deepEqual(stageTags(old, "sgb", "draft"), { to: "chk", cc: "dep", own: false });
  assert.deepEqual(stageTags(old, "sgb", "signing"), { to: "sig", cc: undefined, own: false }, "signing never copies anyone");
  assert.deepEqual(stageTags(old, "fincom", "final"), { to: "fin", cc: "fincc", own: false });
  assert.deepEqual(stageTags(old, "mt-agm", "final"), { to: "sgb", cc: "sgbcc", own: false }, "a new type's final copy goes to the SGB list");

  // A type saved on its own uses its own, including "nobody", and leaves others alone.
  const agm: MinutesRecipientSettings = { ...old, byType: { "mt-agm": { final: { to: "parents-reps" }, signing: { to: "" } } } };
  assert.deepEqual(stageTags(agm, "mt-agm", "final"), { to: "parents-reps", cc: undefined, own: true });
  assert.deepEqual(stageTags(agm, "mt-agm", "signing"), { to: undefined, cc: undefined, own: true }, "nobody, not the fallback");
  assert.deepEqual(stageTags(agm, "mt-agm", "draft"), { to: "chk", cc: "dep", own: false }, "a stage not saved still follows the old list");
  assert.deepEqual(stageTags(agm, "sgb", "final"), { to: "sgb", cc: "sgbcc", own: false });

  // FINCOM's reader default follows FINCOM's own final list once it has one.
  const fin: MinutesRecipientSettings = { ...old, byType: { fincom: { final: { to: "fin2", cc: "" } } } };
  assert.deepEqual(effectiveAccess("fincom", {}, fin).tagIds, ["fin2"]);
  assert.deepEqual(effectiveAccess("fincom", {}, old).tagIds, ["fin", "fincc"]);

  // Storage: saving one type keeps the old lists and every other type.
  await createTag({ id: "t-sign", name: "Signs minutes", description: "", color: "", createdAt: "" });
  await createTag({ id: "t-agm", name: "AGM signers", description: "", color: "", createdAt: "" });
  await savePeople([
    { id: "p1", position: "Chairperson", userId: null, name: "Chair", email: "chair@x.example", phone: "", profilePic: "", tagIds: ["t-sign"] },
    { id: "p2", position: "Parent", userId: null, name: "Parent Rep", email: "rep@x.example", phone: "", profilePic: "", tagIds: ["t-agm"] },
  ]);
  await writeJson("minutes-recipients.json", { to: { signing: "t-sign" }, cc: {} });
  await saveRecipientSettingsFor("mt-agm", { signing: { to: "t-agm" } });
  const saved = await getRecipientSettings();
  assert.equal(saved.to.signing, "t-sign", "old list kept");
  assert.deepEqual((await resolveStage("signing", "sgb")).to.map((r) => r.name), ["Chair"]);
  assert.deepEqual((await resolveStage("signing", "mt-agm")).to.map((r) => r.name), ["Parent Rep"]);
  await saveRecipientSettingsFor("fincom", { draft: { to: "t-sign" } });
  assert.equal((await getRecipientSettings()).byType?.["mt-agm"]?.signing?.to, "t-agm", "saving FINCOM left AGM alone");

  console.log("check-recipients-by-type: all passed");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
