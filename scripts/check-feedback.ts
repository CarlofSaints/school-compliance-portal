// The bug / feature form's input rules and ticket numbers. No server.
//
//   npx tsx scripts/check-feedback.ts
import { parseFeedback, newTicket } from "../lib/feedback";

let fail = 0;
const check = (label: string, ok: boolean) => {
  if (!ok) fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
};
const ok = { kind: "bug", summary: "Save does nothing", detail: "Clicked Save, nothing.", page: "/minutes/abc" };

check("a good report passes", !("error" in parseFeedback(ok)));
check("an unknown kind is refused", "error" in parseFeedback({ ...ok, kind: "praise" }));
check("no body is refused", "error" in parseFeedback(null));
check("a blank title is refused", "error" in parseFeedback({ ...ok, summary: "   " }));
check("a blank description is refused", "error" in parseFeedback({ ...ok, detail: "" }));
check("a long title is refused", "error" in parseFeedback({ ...ok, summary: "x".repeat(121) }));
const page = (p: unknown) => {
  const r = parseFeedback({ ...ok, page: p });
  return "error" in r ? "?" : r.page;
};
// The page goes into a link in the email to School Compliance.
check("a portal path is kept", page("/admin/tags") === "/admin/tags");
check("a full URL is dropped", page("https://evil.example/x") === "");
check("a protocol-relative URL is dropped", page("//evil.example") === "");
check("markup is dropped", page('/x"><script>') === "");
const tickets = new Set(Array.from({ length: 2000 }, newTicket));
check("tickets look like SC-XXXXXX", [...tickets].every((t) => /^SC-[A-HJ-NP-Z2-9]{6}$/.test(t)));
check("2000 tickets, no repeats", tickets.size === 2000);

console.log(fail ? `\n${fail} FAILED` : "\nAll passed");
process.exit(fail ? 1 : 0);
