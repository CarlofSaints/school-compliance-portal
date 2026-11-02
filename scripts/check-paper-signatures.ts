// Signed on paper: a paper tick counts as signed, a scan never closes minutes
// that still have someone outstanding, and a scan CAN be added to minutes the
// ticks already closed (the review caught that failing with a 500).
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-paper-signatures.ts
import assert from "node:assert/strict";
import { signingProgress, mayUploadSignedCopy, type Signatory } from "../lib/minutes";
import { createMinutes, updateMinutes, saveSignedCopy, getMinutes } from "../lib/minutesData";

const s = (email: string, extra: Partial<Signatory> = {}): Signatory =>
  ({ personId: email, name: email, email, role: "other", ...extra });
const signed = (email: string) => s(email, { signedAt: "2026-11-02T08:00:00Z" });

async function main() {
  // One digital, one on paper, one outstanding: open, waiting on the third only.
  const three = [signed("a"), s("b", { signedAt: "2026-11-02T09:00:00Z", onPaper: { markedBy: "A", markedByEmail: "a" } }), s("c")];
  assert.equal(signingProgress(three).complete, false);
  assert.deepEqual(signingProgress(three).waitingOn, ["c"]);
  assert.equal(signingProgress(three.slice(0, 2)).complete, true);

  assert.equal(mayUploadSignedCopy({ status: "awaiting_signatures" }), true);
  assert.equal(mayUploadSignedCopy({ status: "signed" }), true);
  assert.equal(mayUploadSignedCopy({ status: "signed", signedCopy: {} }), false);
  assert.equal(mayUploadSignedCopy({ status: "archived" }), false);

  const base = { title: "Check", body: "sgb", period: { kind: "term", year: 2026, term: 4 }, sections: [] } as unknown as Parameters<typeof createMinutes>[0];
  const bytes = Buffer.from("scan");

  // Open with someone outstanding: the scan is kept, the minutes stay open.
  const open = await createMinutes(base);
  await updateMinutes(open.id, { status: "awaiting_signatures", signatories: [signed("a"), s("c")] });
  const afterOpen = await saveSignedCopy(open.id, bytes, "scan.pdf", "application/pdf", "a", "h");
  assert.equal(afterOpen?.status, "awaiting_signatures");
  assert.ok(afterOpen?.signedCopy);

  // Closed by ticks, no scan yet: adding one works and changes nothing else.
  const closed = await createMinutes(base);
  await updateMinutes(closed.id, { status: "signed", signatories: [signed("a")], signedAt: "2026-11-02T10:00:00Z" });
  const afterClosed = await saveSignedCopy(closed.id, bytes, "scan.pdf", "application/pdf", "a", "h");
  assert.equal(afterClosed?.status, "signed");
  assert.equal(afterClosed?.signedCopy?.filename, "scan.pdf");

  // ...but a signed record still refuses every other change, and a second scan.
  await assert.rejects(updateMinutes(closed.id, { title: "Changed" }));
  await assert.rejects(saveSignedCopy(closed.id, bytes, "two.pdf", "application/pdf", "a", "h"));
  assert.equal((await getMinutes(closed.id))?.signedCopy?.filename, "scan.pdf");

  // No signing list: the upload closes them, as it always has.
  const none = await createMinutes(base);
  assert.equal((await saveSignedCopy(none.id, bytes, "scan.pdf", "application/pdf", "a", "h"))?.status, "signed");

  console.log("check-paper-signatures: all passed");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
