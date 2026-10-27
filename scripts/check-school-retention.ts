// When a suspended school falls due for deletion, and when Carl is reminded.
//
//   npx tsx scripts/check-school-retention.ts
import { deletionDueOn, remindToday } from "../lib/schoolRetention";

let fail = 0;
const check = (label: string, ok: boolean) => {
  if (!ok) fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
};
const at = (d: string) => new Date(`${d}T05:00:00Z`);
const s = { status: "suspended" as const, suspendedAt: "2026-01-01T05:00:00Z" };

check("an active school is never due", deletionDueOn({ status: "active", suspendedAt: s.suspendedAt }) === null);
check("a suspension with no date is never due", deletionDueOn({ status: "suspended" }) === null);
check("due 90 days after suspension", deletionDueOn(s)?.toISOString().slice(0, 10) === "2026-04-01");
check("no reminder on day 89", !remindToday(s, at("2026-03-31")));
check("reminded on day 90", remindToday(s, at("2026-04-01")));
check("not the day after", !remindToday(s, at("2026-04-02")));
check("again a week later", remindToday(s, at("2026-04-08")));
check("an active school is never reminded", !remindToday({ status: "active", suspendedAt: s.suspendedAt }, at("2026-04-01")));

console.log(fail ? `\n${fail} FAILED` : "\nAll passed");
process.exit(fail ? 1 : 0);
