// The sent box keeps 24 months; this is the month it keeps from.
//
//   npx tsx scripts/check-sent-retention.ts
import { sentKeepFrom } from "../lib/sentEmails";

let fail = 0;
const check = (label: string, got: string, want: string) => {
  if (got !== want) fail++;
  console.log(`  ${got === want ? "ok  " : "FAIL"} ${label}${got === want ? "" : ` (got ${got})`}`);
};
check("27 Oct 2026 keeps from Nov 2024", sentKeepFrom(new Date("2026-10-27T05:00:00Z")), "2024-11");
check("1 Jan 2026 keeps from Feb 2024", sentKeepFrom(new Date("2026-01-01T05:00:00Z")), "2024-02");
check("31 Dec keeps from Jan of last year", sentKeepFrom(new Date("2026-12-31T05:00:00Z")), "2025-01");
console.log(fail ? `\n${fail} FAILED` : "\nAll passed");
process.exit(fail ? 1 : 0);
