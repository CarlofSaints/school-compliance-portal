// Moving a school with its own deployment onto the shared app (lib/tenantMove.ts).
//   FAKE_BLOB_PER_TOKEN=1 npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-move-school.ts
// Each token is its own store here, like real Blob: "old" (the old app),
// "new" (the moved school) and "control" (the registry).
import assert from "node:assert/strict";
process.env.FAKE_BLOB_PER_TOKEN = "1";
process.env.CONTROL_BLOB_READ_WRITE_TOKEN = "control";
process.env.TENANT_SECRET = "check-only-secret";
import { put, get, list, del } from "@vercel/blob";
import { createTenant, getTenantByKey } from "../lib/tenantRegistry";
import { seal } from "../lib/secretBox";
import { runInScope } from "../lib/tenantContext";
import { resolveBranding } from "../lib/brandingData";
import { SCHOOLS } from "../lib/branding";
import { copyBatch, pruneRemoved, compare, setHostnames, isMovableKey } from "../lib/tenantMove";

const OLD = { token: "old" };
const NEW = { token: "new" };
const read = async (p: string, t: { token: string }) => {
  const r = await get(p, { access: "private", useCache: false, ...t });
  return r ? Buffer.from(await new Response(r.stream).arrayBuffer()) : null;
};
const write = (p: string, b: Buffer, t: { token: string }) => put(p, b, { access: "private", addRandomSuffix: false, allowOverwrite: true, ...t });

async function fullCopy() {
  let cursor: string | undefined;
  let copied = 0;
  do {
    const r = await copyBatch("old", "jeppe", cursor);
    copied += r.copied;
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return { copied, removed: await pruneRemoved("old", "jeppe") };
}

async function main() {
  // The old app's data, including a binary file and a branding.json the school saved.
  const old: Record<string, Buffer> = {
    "jeppe/users.json": Buffer.from('[{"id":"u1"}]'),
    "jeppe/minutes/m1/record.json": Buffer.from('{"title":"Term 4"}'),
    "jeppe/minutes/m2/record.json": Buffer.from('{"title":"Term 3"}'),
    "jeppe/branding.json": Buffer.from('{"replyTo":"office@school.example"}'),
    "jeppe/policies/p1/file.pdf": Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]),
  };
  for (const [p, b] of Object.entries(old)) await write(p, b, OLD);
  // Two-step sign-in, sealed with the OLD app's key: must not move.
  await write("jeppe/users/u1/mfa.json", Buffer.from('{"secret":"v1.old-key"}'), OLD);

  // Step 1 as createMovedSchool does it (minus creating a real Vercel store).
  await createTenant({ key: "jeppe", name: SCHOOLS.jeppe.fullName, hostnames: ["jeppe-new.example"], blobTokenSealed: seal("new"), status: "active", createdAt: "", builtInLook: "jeppe" } as never);

  // 🔴 Only HVPS and Jeppe: never a self-serve school, never an object-prototype key.
  for (const k of ["st-bothians", "constructor", "generic", "__proto__"]) assert.equal(isMovableKey(k), false, k);
  assert.equal(isMovableKey("jeppe"), true);
  await assert.rejects(pruneRemoved("old", "st-bothians"), /own deployment/);

  // Copy: byte for byte, same paths, old side untouched, MFA left behind.
  assert.equal((await fullCopy()).copied, 5);
  for (const [p, b] of Object.entries(old)) {
    assert.deepEqual(await read(p, NEW), b, `${p} copied byte for byte`);
    assert.deepEqual(await read(p, OLD), b, "the old side is untouched");
  }
  assert.equal(await read("jeppe/users/u1/mfa.json", NEW), null, "two-step sign-in is set up again on the new app");
  assert.equal((await compare("old", "jeppe")).same, true);

  // The exact built-in look, with what the school saved on top - and a second
  // copy (the one just before the switch) does not undo it.
  const look = () => runInScope({ prefix: "jeppe/", token: "new", key: "jeppe", fromRegistry: true }, resolveBranding);
  for (const round of ["after the first copy", "after copying again"]) {
    const b = await look();
    assert.equal(b.colors.primaryDark, "#333333", `hand-tuned hover colour kept ${round}`);
    assert.equal(b.colors.accent, "#fcb517");
    assert.equal(b.slogan, "Forti Nihil Difficilius");
    assert.equal(b.logo, "/logo-jeppe.png", "the built-in crest");
    assert.equal(b.replyTo, "office@school.example", "the school's own saved settings win");
    if (round === "after the first copy") await fullCopy();
  }

  // Changes on the old side between copies: a deleted minute does NOT come back,
  // an edit arrives, and the new side's own two-step set-up is never pruned.
  await del("jeppe/minutes/m2/record.json", OLD);
  await write("jeppe/minutes/m1/record.json", Buffer.from('{"title":"Term 4 (corrected)"}'), OLD);
  await write("jeppe/users/u1/mfa.json", Buffer.from('{"secret":"v1.new-key"}'), NEW);
  const again = await fullCopy();
  assert.equal(again.removed, 1, "the deleted minute is removed");
  assert.equal(await read("jeppe/minutes/m2/record.json", NEW), null);
  assert.equal(String(await read("jeppe/minutes/m1/record.json", NEW)), '{"title":"Term 4 (corrected)"}');
  assert.ok(await read("jeppe/users/u1/mfa.json", NEW), "the new set-up stays");
  const c = await compare("old", "jeppe");
  assert.equal(c.same, true, JSON.stringify(c));

  // Compare notices a file that differs.
  await write("jeppe/policies/p1/file.pdf", Buffer.from("changed and longer"), OLD);
  assert.deepEqual((await compare("old", "jeppe")).differentSize, ["policies/p1/file.pdf"]);
  await fullCopy();
  // ...and an edit that keeps the same length (newer on the old side).
  await new Promise((r) => setTimeout(r, 5));
  await write("jeppe/users.json", Buffer.from('[{"id":"u2"}]'), OLD);
  const edited = await compare("old", "jeppe");
  assert.deepEqual(edited.changedSince, ["users.json"]);
  assert.equal(edited.same, false);
  await fullCopy();
  assert.equal((await compare("old", "jeppe")).same, true);

  // 🔴 A wrong token (an empty old side) never empties the new side.
  await assert.rejects(pruneRemoved("wrong-store", "jeppe"), /Nothing was removed/);
  assert.ok(await read("jeppe/users.json", NEW), "nothing was deleted");

  // The real address.
  await setHostnames("jeppe", ["jeppe-new.example", "jeppe.schoolcompliance.co.za"]);
  const live = await getTenantByKey("jeppe");
  assert.deepEqual(live?.hostnames, ["jeppe-new.example", "jeppe.schoolcompliance.co.za"]);
  assert.ok(live?.switchedAt, "switched over");
  // 🔴 Once live there, copying or pruning would overwrite or delete real work: refused.
  await assert.rejects(copyBatch("old", "jeppe"), /already runs on the shared app/);
  await assert.rejects(pruneRemoved("old", "jeppe"), /already runs on the shared app/);
  assert.equal((await list({ prefix: "jeppe/", token: "control" })).blobs.length, 0, "nothing of the school's lands in the registry store");
  console.log("check-move-school: all passed");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
