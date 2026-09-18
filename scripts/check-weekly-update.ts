// Checks the weekly SGB update: when it is due, the greeting, the numbers,
// and renders the email for each school so it can be looked at. No server,
// no blob, no email sent.
//
//   npx tsx scripts/check-weekly-update.ts [outDir]
//
// Writes weekly-<school>.html (and a -new variant for somebody who has not
// signed in yet) to outDir when one is given.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  weeklyUpdateDue,
  nextSendOn,
  lastOccurrence,
  defaultTeamName,
  buildWeeklyFacts,
  parseWeeklyUpdate,
  DEFAULT_WEEKLY_UPDATE,
  type WeeklyUpdateSettings,
} from "../lib/weeklyUpdate";
import { buildWeeklyUpdateEmail } from "../lib/email";
import type { ActionItem } from "../lib/actionItems";
import type { MinutesRecord } from "../lib/minutesData";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`
  );
}

// 05:00 UTC, when the cron runs. 2026-09-21 is a Monday.
const at = (d: string) => new Date(`${d}T05:00:00Z`);
const on = (over: Partial<WeeklyUpdateSettings> = {}): WeeklyUpdateSettings => ({
  ...DEFAULT_WEEKLY_UPDATE,
  enabled: true,
  weekday: 1,
  enabledOn: "2026-09-18",
  ...over,
});

// --- schedule ---
check("off never sends", weeklyUpdateDue({ ...on(), enabled: false }, at("2026-09-21")), false);
check("Monday, never sent: due", weeklyUpdateDue(on(), at("2026-09-21")), true);
check("Sunday before: not due", weeklyUpdateDue(on(), at("2026-09-20")), false);
check("sent Monday: Tuesday not due", weeklyUpdateDue(on({ lastSentOn: "2026-09-21" }), at("2026-09-22")), false);
check("missed Monday: Tuesday catches up", weeklyUpdateDue(on({ lastSentOn: "2026-09-14" }), at("2026-09-22")), true);
check("missed Monday: Wednesday catches up", weeklyUpdateDue(on({ lastSentOn: "2026-09-14" }), at("2026-09-23")), true);
check("missed Monday: Thursday gives up", weeklyUpdateDue(on({ lastSentOn: "2026-09-14" }), at("2026-09-24")), false);
check("switched on Friday for Mondays: nothing Saturday", weeklyUpdateDue(on({ enabledOn: "2026-09-18" }), at("2026-09-19")), false);
check("switched on Tuesday: no catch-up for that Monday", weeklyUpdateDue(on({ enabledOn: "2026-09-22" }), at("2026-09-23")), false);
check("switched on the Monday itself: sends", weeklyUpdateDue(on({ enabledOn: "2026-09-21" }), at("2026-09-21")), true);
check("sent by hand Sunday: Monday still sends", weeklyUpdateDue(on({ lastSentOn: "2026-09-20" }), at("2026-09-21")), true);
check("sent last Monday: this Monday due", weeklyUpdateDue(on({ lastSentOn: "2026-09-14" }), at("2026-09-21")), true);
check("Friday schedule on a Friday", weeklyUpdateDue(on({ weekday: 5 }), at("2026-09-25")), true);
check("next send from Friday 18th", nextSendOn(on(), at("2026-09-18")), "2026-09-21");
check("next send when due is today", nextSendOn(on(), at("2026-09-21")), "2026-09-21");
check("next send after Monday's send", nextSendOn(on({ lastSentOn: "2026-09-21" }), at("2026-09-21")), "2026-09-28");
check("next send when off", nextSendOn({ ...on(), enabled: false }, at("2026-09-21")), null);
check("lastOccurrence Monday from Sunday", lastOccurrence("2026-09-27", 1), "2026-09-21");
check("bad weekday parses to Monday", parseWeeklyUpdate({ weekday: 9 }).weekday, 1);
check("enabled must be literally true", parseWeeklyUpdate({ enabled: "yes" }).enabled, false);

// --- greeting ---
check("Hurlyvale Primary School", defaultTeamName("Hurlyvale Primary School"), "Hurlyvale");
check("Jeppe Girls High", defaultTeamName("Jeppe Girls High"), "Jeppe Girls");
check("St John's College", defaultTeamName("St John's College"), "St John's");
check("a name that is only 'High School' survives", defaultTeamName("High School"), "High School");

// --- facts ---
const act = (ref: string, over: Partial<ActionItem>): ActionItem =>
  ({
    id: ref,
    ref,
    title: `Action ${ref}`,
    description: "",
    assigneeIds: [],
    assigneeNames: ["Graham"],
    category: "",
    priority: "medium",
    dueDate: "",
    status: "not_started",
    progress: 0,
    updates: [],
    reminder: { enabled: true, daysBefore: 3, repeatEveryDays: 7, recipients: ["assignees"] },
    raisedById: "",
    raisedByName: "",
    createdAt: "",
    updatedAt: "",
    ...over,
  }) as ActionItem;
const actions = [
  act("A-004", { title: "Appoint and train an EE Committee by 31 August", dueDate: "2026-08-31" }),
  act("A-008", { title: "Aftercare cost benefit analysis", dueDate: "2026-09-15", assigneeNames: ["Rob", "Carl"] }),
  act("A-011", { dueDate: "2026-09-24" }),
  act("A-012", {}),
  act("A-013", { status: "done", dueDate: "2026-08-01" }),
  act("A-014", { status: "cancelled" }),
];
const users = [
  { forcePasswordChange: false },
  { forcePasswordChange: true },
  { forcePasswordChange: true },
  { forcePasswordChange: false },
];
const minutes = [
  {
    title: "SGB Meeting",
    period: { kind: "month", year: 2026, month: 8 },
    status: "awaiting_signatures",
    signatories: [
      { personId: "1", name: "Principal Naidoo", email: "", role: "principal", signedAt: "2026-09-10" },
      { personId: "2", name: "Chair Smith", email: "", role: "sgb_chair" },
    ],
  },
  { title: "FINCOM", period: { kind: "month", year: 2026, month: 7 }, status: "signed", signatories: [] },
  { title: "Draft", period: { kind: "month", year: 2026, month: 9 }, status: "draft", signatories: [] },
] as unknown as MinutesRecord[];
const facts = buildWeeklyFacts(actions, users, minutes, at("2026-09-21"));
check("open = not done/cancelled", facts.actions.open, 4);
check("overdue", facts.actions.overdue, 2);
check("due this week", facts.actions.dueThisWeek, 1);
check("overdue list most late first", facts.actions.overdueList.map((a) => a.ref), ["A-004", "A-008"]);
check("days late", facts.actions.overdueList[0].daysLate, 21);
check("not activated", facts.accounts, { total: 4, notActivated: 2 });
check("only awaiting-signature minutes", facts.minutes.map((m) => m.title), ["SGB Meeting"]);
check("waiting on", facts.minutes[0].waitingOn, ["Chair Smith"]);

// --- render ---
const hvps = {
  key: "hvps",
  schoolType: "public",
  shortName: "HVPS",
  fullName: "Hurlyvale Primary School",
  portalSubtitle: "SGB Portal",
  tagline: "SGB Compliance Portal",
  slogan: "Strive for excellence",
  logo: "/logo.png",
  logoAlt: "HVPS crest",
  fromEmail: "noreply@schoolcompliance.co.za",
  colors: { primary: "#00BCD4", primaryDark: "#0097A7", dark: "#1a1a2e", primaryTint: "#B2EBF2", accent: "#00BCD4" },
};
const jeppe = {
  ...hvps,
  key: "jeppe",
  shortName: "JGHS",
  fullName: "Jeppe Girls High",
  logoAlt: "Jeppe crest",
  colors: { primary: "#000000", primaryDark: "#111111", dark: "#111111", primaryTint: "#FFD54F", accent: "#FFD54F" },
};

const out = process.argv[2];
for (const b of [hvps, jeppe]) {
  for (const notActivated of [false, true]) {
    const tag = `${b.key}${notActivated ? " (not signed in)" : ""}`;
    const { subject, html } = buildWeeklyUpdateEmail(b as never, "someone@example.com", "Test Person", {
      teamName: defaultTeamName(b.fullName),
      weekOf: "2026-09-21",
      facts,
      notActivated,
    });
    check(`${tag}: greeting`, html.includes(`Good day, ${defaultTeamName(b.fullName)} team.`), true);
    check(`${tag}: school colour used`, html.includes(b.colors.primary), true);
    check(`${tag}: set-password box only when not signed in`, html.includes("Set my password"), notActivated);
    check(`${tag}: no em dash in our copy`, html.replace(/&mdash;/g, "").includes("—"), false);
    if (!notActivated) console.log(`        subject: ${subject}`);
    if (out) writeFileSync(join(out, `weekly-${b.key}${notActivated ? "-new" : ""}.html`), html);
  }
}

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
