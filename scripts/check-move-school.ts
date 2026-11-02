// Moving a school with its own deployment onto the shared app (lib/tenantMove.ts).
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-move-school.ts
// The fake store ignores tokens, so the two sides are told apart by folder:
// the old app's "oldschool/" and the new school's "newschool/".
import assert from "node:assert/strict";
process.env.CONTROL_BLOB_READ_WRITE_TOKEN = "control";
process.env.TENANT_SECRET = "check-only-secret";
import { put, get, list } from "@vercel/blob";
import { createTenant, getTenantByKey } from "../lib/tenantRegistry";
import { seal } from "../lib/secretBox";
import { copyBatch, compare, applyBuiltInBranding, setHostnames } from "../lib/tenantMove";

const read = async (p: string) => {
  const r = await get(p, { access: "private", useCache: false, token: "x" });
  return r ? Buffer.from(await new Response(r.stream).arrayBuffer()) : null;
};

async function main() {
  // The old app's data, under its own folder, including a binary file.
  const old: Record<string, Buffer> = {
    "oldschool/users.json": Buffer.from('[{"id":"u1"}]'),
    "oldschool/minutes/m1/record.json": Buffer.from('{"title":"Term 4"}'),
    "oldschool/branding.json": Buffer.from('{"replyTo":"office@school.example"}'),
    "oldschool/policies/p1/file.pdf": Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]),
  };
  // A two-step sign-in record, sealed with the OLD app's key: must not move.
  await put("oldschool/users/u1/mfa.json", Buffer.from(`{"secret":"v1.sealed-with-old-key"}`), { access: "private", addRandomSuffix: false, allowOverwrite: true, token: "old" });
  for (const [p, b] of Object.entries(old)) await put(p, b, { access: "private", addRandomSuffix: false, allowOverwrite: true, token: "old" });

  await createTenant({ key: "newschool", name: "New School", hostnames: ["newschool-test.example"], blobTokenSealed: seal("new"), status: "active", createdAt: "" } as never);

  // Copy in batches until done; every file lands at the same relative path.
  let cursor: string | undefined;
  let copied = 0;
  do {
    const r = await copyBatch("old", "oldschool/", "newschool", cursor);
    copied += r.copied;
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  assert.equal(copied, 4, "the MFA record is left behind");
  assert.equal(await read("newschool/users/u1/mfa.json"), null, "two-step sign-in is set up again on the new app");
  for (const [p, b] of Object.entries(old)) {
    assert.deepEqual(await read(p.replace("oldschool/", "newschool/")), b, `${p} copied byte for byte`);
    assert.deepEqual(await read(p), b, "the old side is untouched");
  }
  // Running it again is safe (overwrites, no duplicates).
  await copyBatch("old", "oldschool/", "newschool");
  assert.equal((await list({ prefix: "newschool/", token: "x" })).blobs.length, 4);

  const c = await compare("old", "oldschool/", "newschool");
  assert.equal(c.source.files, 4);
  assert.equal(c.moved.files, 4);

  // Branding: the built-in look, WITHOUT losing what the school saved (its reply-to).
  const b = await applyBuiltInBranding("newschool", { fullName: "Jeppe Girls High", shortName: "JGHS", primary: "#000000", accent: "#fcb517", logoFile: "/logo-jeppe.png" });
  assert.equal(b.replyTo, "office@school.example", "the school's own saved branding wins");
  assert.equal(b.accent, "#fcb517");
  assert.ok((await read("newschool/branding/logo"))!.length > 1000, "crest copied from public/");

  // The real address is added; the test one can stay or go.
  await setHostnames("newschool", ["newschool-test.example", "newschool.example"]);
  assert.deepEqual((await getTenantByKey("newschool"))?.hostnames, ["newschool-test.example", "newschool.example"]);
  console.log("check-move-school: all passed");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
