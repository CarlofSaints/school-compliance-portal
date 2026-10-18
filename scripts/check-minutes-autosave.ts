// Unsaved minutes typing is never lost (pure, no server):
//
//   npx tsx scripts/check-minutes-autosave.ts

import {
  backupKeys,
  clearUserBackups,
  draftIsBehind,
  draftToOffer,
  hasUnsaved,
  isTextEditable,
  readDraft,
  reconcile,
  removeDraft,
  sameText,
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
const newer = { ...local, updatedAt: "2026-10-18T10:00:05.000Z" };
const staleRead = { ...server, updatedAt: "2026-10-18T10:00:00.000Z" };
check("stale read (older than what is on screen): the screen stays, text and status",
  reconcile(staleRead, newer, false), { record: newer, stranded: null });
check("stale read with typing: the screen stays", reconcile(staleRead, newer, true).record, newer);
check("newer read: taken as normal", reconcile({ ...server, updatedAt: "2026-10-18T10:00:09.000Z" }, newer, false).record.title, "Old");
check("no timestamps: never treated as stale", reconcile(server, local, false).record, server);
check("draft and in_review are editable", [isTextEditable("draft"), isTextEditable("in_review")], [true, true]);

console.log("\nLocal backup");
check("keys are per site, per person and per minutes", backupKeys("hvps.example", "u7", "m1"),
  { main: "minutes-draft:hvps.example:u7:m1", offered: "minutes-draft-offered:hvps.example:u7:m1" });
const mem = new Map<string, string>();
const store = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};
const key = backupKeys("h", "u1", "m1").main;
const draft = { ...textOf(local), editedAt: "2026-10-18T10:00:00.000Z", baseUpdatedAt: "x" };
writeDraft(store, key, draft);
check("written and read back", readDraft(store, key), draft);
check("differs from the server: offered", draftToOffer(readDraft(store, key), server), draft);
check("same text as the server: not offered", draftToOffer(readDraft(store, key), { ...server, ...textOf(local) }), null);
check("no backup: nothing offered", draftToOffer(readDraft(store, backupKeys("h", "u1", "other").main), server), null);

console.log("\nSame words, stored differently");
const typed = {
  title: " Budget meeting ", body: "sgb", period: { kind: "month", year: 2026, month: 10 },
  sections: [{ id: "x1", title: "Finance ", body: "Fees up.", order: 3, numberingStartsHere: false }],
};
const saved = {
  title: "Budget meeting", body: "sgb", period: { month: 10, kind: "month", year: 2026 },
  sections: [
    { order: 1, body: "Fees up.", title: "Finance", id: "srv-1" },
    { id: "a", title: "Apologies", body: "", order: 2, kind: "apologies" },
  ],
};
check("trim, ids, order numbers, key order, empty Apologies: the same", sameText(typed, saved), true);
check("a real change to a word: different", sameText(typed, { ...saved, sections: [{ ...saved.sections[0], body: "Fees down." }] }), false);
check("an Apologies section with names in it counts",
  sameText(typed, { ...saved, sections: [saved.sections[0], { ...saved.sections[1], body: "Ms Dube" }] }), false);
check("so saved text raises no banner", draftToOffer({ ...typed, editedAt: "t" }, saved), null);

console.log("\nBackup made before the minutes changed");
const base = { ...draft, baseUpdatedAt: "2026-10-18T09:00:00.000Z" };
check("server saved again after the backup's base: behind", draftIsBehind(base, { updatedAt: "2026-10-18T09:30:00.000Z" }), true);
check("server unchanged since: not behind", draftIsBehind(base, { updatedAt: "2026-10-18T09:00:00.000Z" }), false);
check("no base recorded: not behind", draftIsBehind({ ...draft, baseUpdatedAt: undefined }, { updatedAt: "z" }), false);

console.log("\nSign-out");
const all = new Map<string, string>([
  ["minutes-draft:h:u1:m1", "a"], ["minutes-draft-offered:h:u1:m2", "b"],
  ["minutes-draft:h:u2:m1", "c"], ["minutes-draft:other:u1:m1", "d"], ["hvps_session", "e"],
]);
const listing = {
  get length() { return all.size; },
  key: (i: number) => [...all.keys()][i] ?? null,
  removeItem: (k: string) => void all.delete(k),
};
clearUserBackups(listing, "h", "u1");
check("only this person's backups on this site go", [...all.keys()], ["minutes-draft:h:u2:m1", "minutes-draft:other:u1:m1", "hvps_session"]);
clearUserBackups(null, "h", "u1");
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
