// Unsaved minutes typing is never lost (pure, no server):
//
//   npx tsx scripts/check-minutes-autosave.ts

import { backupKeys, clearUserBackups, otherTabsUnsaved } from "../lib/minutesBackupKeys";
import {
  fromLiveTab,
  textBase,
  draftIsBehind,
  draftToOffer,
  hasUnsaved,
  isTextEditable,
  mergeOffered,
  mergeTypingOverSave,
  readDraft,
  plainText,
  readOffered,
  savePayload,
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
check("nothing unsaved: the server copy, whole", reconcile(server, local, false), { record: server, stranded: null, conflict: null });
check("first load (no local copy): the server copy", reconcile(server, null, true), { record: server, stranded: null, conflict: null });
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
  reconcile(staleRead, newer, false), { record: newer, stranded: null, conflict: null });
check("stale read with typing: the screen stays", reconcile(staleRead, newer, true).record, newer);
check("newer read: taken as normal", reconcile({ ...server, updatedAt: "2026-10-18T10:00:09.000Z" }, newer, false).record.title, "Old");
check("no timestamps: never treated as stale", reconcile(server, local, false).record, server);
check("draft and in_review are editable", [isTextEditable("draft"), isTextEditable("in_review")], [true, true]);

console.log("\nSomebody else changed the words meanwhile");
const mine = { ...local, status: "draft" as MinutesStatus, textUpdatedAt: "2026-10-18T09:00:00.000Z", updatedAt: "2026-10-18T09:00:00.000Z" };
const theirs = { ...server, status: "draft" as MinutesStatus, title: "Their title", textUpdatedAt: "2026-10-18T09:05:00.000Z", updatedAt: "2026-10-18T09:05:00.000Z" };
const clash = reconcile(theirs, mine, true);
check("their newer words are never laid over silently: conflict carries theirs", clash.conflict, theirs);
check("my typing stays on screen", textOf(clash.record), textOf(mine));
check("still based on the OLD words, so the server keeps refusing it", clash.record.textUpdatedAt, mine.textUpdatedAt);
check("a review or signature (updatedAt moves, words do not): no conflict",
  reconcile({ ...theirs, ...textOf(server), textUpdatedAt: mine.textUpdatedAt }, mine, true).conflict, null);
check("they saved the very same words: no conflict", reconcile({ ...theirs, ...textOf(mine) }, mine, true).conflict, null);
check("nothing unsaved here: simply take theirs", reconcile(theirs, mine, false), { record: theirs, stranded: null, conflict: null });
check("the save body carries the base it was edited from", savePayload(mine).baseTextUpdatedAt, mine.textUpdatedAt);

console.log("\nPlain text to copy");
const copyable = plainText(
  {
    title: "SGB meeting", body: "sgb", period: { kind: "month", year: 2026, month: 10 },
    sections: [
      { title: "Present", body: "", kind: "attendance", attendees: [{ position: "Chair", name: "Ms Dube" }, { position: "Clerk", name: "Mr Nel", status: "apology" }] },
      { title: "Fence", body: "Get quotes.", responsible: "Mr Nel" },
    ],
  },
  (s) => `[${s}]`
);
check("title, meeting, attendance with status, responsible: all there",
  ["SGB meeting", "Chair: Ms Dube", "Clerk: Mr Nel ([Apology])", "Get quotes.", "[Responsible]: Mr Nel"].every((x) => copyable.includes(x)), true);

console.log("\nLocal backup");
check("keys are per site, per person, per minutes and per tab", backupKeys("hvps.example", "u7", "m1", "tab9"), {
  main: "minutes-draft:hvps.example:u7:m1:tab9",
  tabsPrefix: "minutes-draft:hvps.example:u7:m1:",
  offered: "minutes-draft-offered:hvps.example:u7:m1",
});
check("two tabs on the same minutes: two keys", backupKeys("h", "u", "m", "a").main !== backupKeys("h", "u", "m", "b").main, true);
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
check("a body differing only in trailing space is a change (the route keeps bodies as typed)",
  sameText(typed, { ...saved, sections: [{ ...saved.sections[0], body: "Fees up. " }, saved.sections[1]] }), false);

console.log("\nTyping carried on during a save");
const sentT = {
  title: "T", body: "sgb", period: { y: 1 },
  sections: [{ id: "a", title: "A", body: "one" }, { id: "b", title: "B", body: "two" }, { id: "c", title: "C", body: "three" }],
};
const savedT = {
  ...sentT, textUpdatedAt: "new",
  sections: [
    { id: "a", title: "A", body: "one", order: 1 }, { id: "b", title: "B", body: "two", order: 2 },
    { id: "c", title: "C", body: "three", order: 3 }, { id: "ap", title: "Apologies", body: "", order: 4, kind: "apologies" },
  ],
};
const nowT = { ...sentT, title: "T2", sections: [{ id: "a", title: "A", body: "one" }, { id: "b", title: "B", body: "two, more" }] };
const mergedT = mergeTypingOverSave(savedT, sentT, nowT);
check("a field changed since the save: mine", mergedT.title, "T2");
check("unchanged sections: the server's copy (with order)", mergedT.sections[0], savedT.sections[0]);
check("a section changed since: mine", mergedT.sections[1], nowT.sections[1]);
check("a section deleted since: stays deleted", mergedT.sections.some((s) => s.id === "c"), false);
check("the section the server added: kept", mergedT.sections.some((s) => s.id === "ap"), true);
check("the new base comes from the save", mergedT.textUpdatedAt, "new");
check("nothing changed in sections since: exactly the server's", mergeTypingOverSave(savedT, sentT, { ...sentT, title: "x" }).sections, savedT.sections);
check("a real change to a word: different", sameText(typed, { ...saved, sections: [{ ...saved.sections[0], body: "Fees down." }] }), false);
check("an Apologies section with names in it counts",
  sameText(typed, { ...saved, sections: [saved.sections[0], { ...saved.sections[1], body: "Ms Dube" }] }), false);
check("so saved text raises no banner", draftToOffer({ ...typed, editedAt: "t" }, saved), null);

console.log("\nBackup made before the minutes changed");
const base = { ...draft, baseUpdatedAt: "2026-10-18T09:00:00.000Z" };
check("server saved again after the backup's base: behind", draftIsBehind(base, { textUpdatedAt: "2026-10-18T09:30:00.000Z" }), true);
check("server unchanged since: not behind", draftIsBehind(base, { textUpdatedAt: "2026-10-18T09:00:00.000Z" }), false);
check("no base recorded: not behind", draftIsBehind({ ...draft, baseUpdatedAt: undefined }, { textUpdatedAt: "z" }), false);

console.log("\nSign-out");
const all = new Map<string, string>([
  ["minutes-draft:h:u1:m1", "a"], ["minutes-draft-offered:h:u1:m2", "b"],
  ["minutes-draft:h:u2:m1", "c"], ["minutes-draft:other:u1:m1", "d"], ["hvps_session", "e"],
]);
const listing = {
  get length() { return all.size; },
  key: (i: number) => [...all.keys()][i] ?? null,
  getItem: (k: string) => all.get(k) ?? null,
  removeItem: (k: string) => void all.delete(k),
};
clearUserBackups(listing, "h", "u1");
check("only this person's backups on this site go", [...all.keys()], ["minutes-draft:h:u2:m1", "minutes-draft:other:u1:m1", "hvps_session"]);
clearUserBackups(null, "h", "u1");

console.log("\nOther tabs");
const nowMs = Date.parse("2026-10-18T10:00:00.000Z");
const ago = (s: number) => new Date(nowMs - s * 1000).toISOString();
all.clear();
all.set("minutes-draft:h:u1:m1", JSON.stringify({ editedAt: ago(60), tabId: "other" }));
all.set("minutes-draft:h:u1:m2", JSON.stringify({ editedAt: ago(60), tabId: "me" }));
all.set("minutes-draft:h:u1:m3", JSON.stringify({ editedAt: ago(3600), tabId: "other" }));
all.set("minutes-draft:h:u2:m1", JSON.stringify({ editedAt: ago(60), tabId: "other" }));
check("sign-out counts ANOTHER tab's backups for this person, of any age",
  otherTabsUnsaved(listing, "h", "u1", "me"), 2);
check("another tab's backup from 10s ago: a live tab, left alone",
  fromLiveTab({ ...draft, editedAt: ago(10), tabId: "other" }, "me", nowMs), true);
check("from 2 minutes ago: offered", fromLiveTab({ ...draft, editedAt: ago(120), tabId: "other" }, "me", nowMs), false);
check("this tab's own: never treated as another live tab", fromLiveTab({ ...draft, editedAt: ago(10), tabId: "me" }, "me", nowMs), false);

console.log("\nMinutes from before textUpdatedAt");
check("the base falls back to updatedAt", textBase({ updatedAt: "U" }), "U");
check("and prefers textUpdatedAt", textBase({ updatedAt: "U", textUpdatedAt: "T" }), "T");
const oldMine = { ...local, status: "draft" as MinutesStatus, updatedAt: "2026-10-18T09:00:00.000Z" };
const oldTheirs = { ...server, status: "draft" as MinutesStatus, title: "Theirs", updatedAt: "2026-10-18T09:05:00.000Z" };
const oldClash = reconcile(oldTheirs, oldMine, true);
check("legacy minutes: newer words from someone else are still a conflict", oldClash.conflict, oldTheirs);
check("and the save stays based on MY old base, so the server refuses it", savePayload(oldClash.record).baseTextUpdatedAt, oldMine.updatedAt);
check("legacy backup behind the server's updatedAt", draftIsBehind({ ...draft, baseUpdatedAt: oldMine.updatedAt }, oldTheirs), true);

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
