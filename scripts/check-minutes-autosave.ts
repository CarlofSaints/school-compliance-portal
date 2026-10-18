// A reload never puts the server's older text over unsaved typing (pure):
//
//   npx tsx scripts/check-minutes-autosave.ts

import { mergeUnsaved } from "../lib/minutesAutosave";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`);
}

const server = {
  title: "Old", body: "sgb", period: { year: 2026 }, sections: [{ id: "a", body: "" }],
  status: "in_review", reviews: [{ by: "x" }], draftNumber: 2,
};
const local = {
  title: "New", body: "fincom", period: { year: 2027 }, sections: [{ id: "a", body: "typed" }],
  status: "draft", reviews: [], draftNumber: 1,
};

check("nothing unsaved: the server copy, whole", mergeUnsaved(server, local, false), server);
check("no local copy yet (first load): the server copy", mergeUnsaved(server, null, true), server);
const merged = mergeUnsaved(server, local, true);
check("unsaved: the typed text stays", [merged.title, merged.body, merged.period, merged.sections], [local.title, local.body, local.period, local.sections]);
check("unsaved: workflow state comes from the server", [merged.status, merged.reviews, merged.draftNumber], [server.status, server.reviews, server.draftNumber]);

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
