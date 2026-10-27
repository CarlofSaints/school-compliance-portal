// Every page the guide-video popup names has a real page and a real clip, so a
// renamed route or a missing mp4 is caught here, not by a school seeing a
// black box in the corner.
//
//   npx tsx scripts/check-guide-videos.ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { VIDEOS } from "../components/GuideVideo";

let fail = 0;
const root = join(__dirname, "..");
for (const [path, id] of Object.entries(VIDEOS)) {
  const page = join(root, "app", "(portal)", ...path.split("/").filter(Boolean), "page.tsx");
  const clip = join(root, "public", "tutorials", `${id}.mp4`);
  for (const [what, file] of [["page", page], ["clip", clip]] as const) {
    if (!existsSync(file)) {
      fail++;
      console.error(`FAIL ${path}: no ${what} at ${file}`);
    }
  }
}
console.log(fail ? `\n${fail} FAILED` : `\nAll ${Object.keys(VIDEOS).length} pages have a page and a clip`);
process.exit(fail ? 1 : 0);
