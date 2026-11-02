// Ask Jono's "how do I..." knowledge: the Guide as plain text, its videos, and newer features.
//   npx tsx scripts/check-jono-howto.ts
import assert from "node:assert/strict";
import { portalHowTo } from "../lib/jonoHowTo";

const text = portalHowTo("Demo Primary School", "SGB", "");
assert.ok(!/<[a-z/][^>]*>/i.test(text), "no HTML left");
assert.ok(text.includes("## People, users and tags") && text.includes("## Writing the minutes"));
assert.ok(text.includes("/tutorials/tags.mp4") && text.includes("/tutorials/minutes-admin.mp4"), "videos linked");
assert.ok(/Create minutes template/.test(text) && /\+ Tag person/.test(text) && /Create User/.test(text), "newer features covered");
assert.ok(text.length < 60_000, `about ${Math.round(text.length / 4)} tokens, kept small`);
console.log(`check-jono-howto: all passed (${text.length} chars)`);
