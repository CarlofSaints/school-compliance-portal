// Unsaved minutes typing is never lost (pure, no server):
//
//   npx tsx scripts/check-minutes-autosave.ts

import {
  backupKeyFor,
  draftToOffer,
  hasUnsaved,
  isTextEditable,
  readDraft,
  reconcile,
  removeDraft,
  textOf,
  writeDraft,
} from "../lib/minutesAutosave";
import type { MinutesStatus } from "../lib/minutes";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`);
}

const server = {
  title: "Old", body: "sgb", period: { year: 2026 }, sections: [{ id: "a", body: "" }],
  status: "in_review" as MinutesStatus, reviews: [{ by: "x" }], draftNumber: 2,
};
const local = {
  title: "New", body: "fincom", period: { year: 2027 }, sections: [{ id: "a", body: "typed" }],
  status: "draft" as MinutesStatus, reviews: [], draftNumber: 1,
};

console.log("Unsaved");
check("same versions: saved", hasUnsaved({ edit: 3, saved: 3 }), false);
check("an edit after the last save: unsaved", hasUnsaved({ edit: 4, saved: 3 }), true);

console.log("\nReload over typing");
check("nothing unsaved: the server copy, whole", reconcile(server, local, false), { record: server, stranded: null });
check("first load (no local copy): the server copy", reconcile(server, null, true), { record: server, stranded: null });
const merged = reconcile(server, local, true);
check("still editable: the typed text stays", textOf(merged.record), textOf(local));
check("still editable: workflow state comes from the server",
  [merged.record.status, merged.record.reviews, merged.record.draftNumber], [server.status, server.reviews, server.draftNumber]);
check("still editable: nothing stranded", merged.stranded, null);
for (const status of ["awaiting_signatures", "signed", "archived"] as MinutesStatus[]) {
  const locked = reconcile({ ...server, status }, local, true);
  check(`${status}: the editor shows the SERVER text`, textOf(locked.record), textOf(server));
  check(`${status}: the typing comes back to copy`, locked.stranded, textOf(local));
}
check("draft and in_review are editable", [isTextEditable("draft"), isTextEditable("in_review")], [true, true]);

console.log("\nLocal backup");
check("key is per site and per minutes", backupKeyFor("hvps.example", "m1"), "minutes-draft:hvps.example:m1");
const mem = new Map<string, string>();
const store = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};
const key = backupKeyFor("h", "m1");
const draft = { ...textOf(local), editedAt: "2026-10-18T10:00:00.000Z", baseUpdatedAt: "x" };
writeDraft(store, key, draft);
check("written and read back", readDraft(store, key), draft);
check("differs from the server: offered", draftToOffer(readDraft(store, key), server), draft);
check("same text as the server: not offered", draftToOffer(readDraft(store, key), { ...server, ...textOf(local) }), null);
check("no backup: nothing offered", draftToOffer(readDraft(store, backupKeyFor("h", "other")), server), null);
mem.set(key, "{not json");
check("corrupt backup: ignored", readDraft(store, key), null);
mem.set(key, JSON.stringify({ title: 1 }));
check("not our shape: ignored", readDraft(store, key), null);
removeDraft(store, key);
check("removed", mem.has(key), false);
const throwing = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("blocked"); },
  removeItem: () => { throw new Error("blocked"); },
};
writeDraft(throwing, key, draft);
removeDraft(throwing, key);
check("blocked storage: read gives nothing, write and remove do not throw", readDraft(throwing, key), null);
check("no storage at all", readDraft(null, key), null);

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
