// Signed on paper: a paper tick counts as signed, a scan never closes minutes
// that still have someone outstanding. Run: npx tsx scripts/check-paper-signatures.ts
import assert from "node:assert/strict";
import { signingProgress, mayUploadSignedCopy, type Signatory } from "../lib/minutes";

const s = (email: string, extra: Partial<Signatory> = {}): Signatory =>
  ({ personId: email, name: email, email, role: "other", ...extra });

// One digital, one on paper, one outstanding: open, waiting on the third only.
const three = [
  s("a", { signedAt: "2026-11-02T08:00:00Z" }),
  s("b", { signedAt: "2026-11-02T09:00:00Z", onPaper: { markedBy: "A", markedByEmail: "a" } }),
  s("c"),
];
const p = signingProgress(three);
assert.equal(p.complete, false);
assert.deepEqual(p.waitingOn, ["c"]);

// Digital + paper covering everyone: complete.
assert.equal(signingProgress(three.slice(0, 2)).complete, true);

// Uploads: open takes a scan, signed takes one only if none is kept yet.
assert.equal(mayUploadSignedCopy({ status: "awaiting_signatures" }), true);
assert.equal(mayUploadSignedCopy({ status: "signed" }), true);
assert.equal(mayUploadSignedCopy({ status: "signed", signedCopy: {} }), false);
assert.equal(mayUploadSignedCopy({ status: "archived" }), false);
console.log("check-paper-signatures: all passed");
