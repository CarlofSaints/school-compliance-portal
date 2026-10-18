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
  mergeOffered,
  readDraft,
  readOffered,
  reconcile,
  removeDraft,
  retryDelayMs,
  sameText,
  saveFailureKind,
  textOf,
  writeDraft,
  writeOffered,
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

console.log("\nSame words, as the save route rebuilds them");
const att = {
  title: "Present", body: "", period: { kind: "month", year: 2026, month: 10 },
  sections: [{
    id: "s1", title: "Present", body: "", order: 1, kind: "attendance", responsible: "  ", personIds: [],
    attendees: [{ position: " Chair ", name: "Ms Dube " }, { position: "", name: "" }, { position: "Clerk", name: "Mr Nel", status: "bogus" }],
  }],
};
const attSaved = {
  ...att,
  sections: [{
    id: "srv", title: "Present", body: "", order: 1, kind: "attendance",
    attendees: [{ position: "Chair", name: "Ms Dube" }, { position: "Clerk", name: "Mr Nel" }],
  }],
};
check("attendees cleaned, blank responsible and empty personIds: the same", sameText(att, attSaved), true);
check("a person marked away is a real change",
  sameText(att, { ...attSaved, sections: [{ ...attSaved.sections[0], attendees: [{ position: "Chair", name: "Ms Dube", status: "apology" }, { position: "Clerk", name: "Mr Nel" }] }] }), false);
check("responsible filled in is a real change",
  sameText(att, { ...attSaved, sections: [{ ...attSaved.sections[0], responsible: "Mr Nel" }] }), false);
check("a keepalive save that landed: its backup is dropped on the next visit", draftToOffer({ ...att, editedAt: "t" }, attSaved), null);

console.log("\nOffered backups");
const d1 = { ...draft, title: "One", editedAt: "2026-10-18T08:00:00.000Z" };
const d2 = { ...draft, title: "Two", editedAt: "2026-10-18T09:00:00.000Z" };
const d3 = { ...draft, title: "Three", editedAt: "2026-10-18T10:00:00.000Z" };
const d4 = { ...draft, title: "Four", editedAt: "2026-10-18T11:00:00.000Z" };
check("a new backup joins the old one, newest first", mergeOffered([d1], d2, server).map((d) => d.title), ["Two", "One"]);
check("at most three, the oldest goes", mergeOffered([d3, d2, d1], d4, server).map((d) => d.title), ["Four", "Three", "Two"]);
check("the same words twice: kept once", mergeOffered([d1], { ...d1, editedAt: "2026-10-18T12:00:00.000Z" }, server).length, 1);
check("one the server already holds: dropped", mergeOffered([{ ...d1, ...textOf(server) }], null, server), []);
const okey = backupKeys("h", "u1", "m1").offered;
writeOffered(store, okey, [d2, d1]);
check("list written and read back", readOffered(store, okey).map((d) => d.title), ["Two", "One"]);
mem.set(okey, JSON.stringify(d1));
check("an old single backup still reads", readOffered(store, okey).map((d) => d.title), ["One"]);
mem.set(okey, JSON.stringify([d1, { title: 5 }]));
check("a bad entry is skipped, the good one kept", readOffered(store, okey).map((d) => d.title), ["One"]);
writeOffered(store, okey, []);
check("an empty list removes the key", mem.has(okey), false);

console.log("\nRetrying");
check("401: signed out", saveFailureKind(401), "signed-out");
check("408, 429, 500, 503: transient", [408, 429, 500, 503].map(saveFailureKind), ["transient", "transient", "transient", "transient"]);
check("400, 403, 409: refused", [400, 403, 409].map(saveFailureKind), ["refused", "refused", "refused"]);
check("backoff 5s, 15s, then 30s", [1, 2, 3, 7].map((n) => retryDelayMs(n, null)), [5000, 15000, 30000, 30000]);
check("Retry-After in seconds is honoured", retryDelayMs(1, "60"), 60000);
check("Retry-After as a date is honoured", retryDelayMs(1, new Date(Date.parse("2026-10-18T10:00:20Z")).toUTCString(), Date.parse("2026-10-18T10:00:00Z")), 20000);
check("a shorter Retry-After never undercuts the backoff", retryDelayMs(3, "1"), 30000);
check("capped at 5 minutes; nonsense ignored", [retryDelayMs(1, "99999"), retryDelayMs(2, "soon")], [300000, 15000]);
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
