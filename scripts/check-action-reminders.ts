// Checks the action-item reminder schedule end to end, with no server, no blob
// and no email involved.
//
//   npx tsx scripts/check-action-reminders.ts
//
// Everything it exercises is pure, which is why nextReminderOn derives the next
// chase from the due date rather than storing one. Run it after touching
// lib/actionItems.ts: a chase that stops silently, or fires twice, is the kind
// of thing nobody notices until an action is a month late.
import {
  nextReminderOn,
  reminderDue,
  normalise,
  summarise,
  duePhrase,
  parseReminder,
  DEFAULT_REMINDER,
} from "../lib/actionItems";
import type { ActionItem } from "../lib/actionItems";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`
  );
}

function item(over: Partial<ActionItem> = {}): ActionItem {
  return {
    id: "1",
    ref: "A-001",
    title: "Quotes for the hall roof",
    description: "",
    assigneeIds: ["p1"],
    assigneeNames: ["Dee"],
    category: "Infrastructure",
    priority: "medium",
    dueDate: "2026-09-20",
    status: "not_started",
    progress: 0,
    updates: [],
    reminder: { ...DEFAULT_REMINDER },
    raisedById: "u1",
    raisedByName: "Carl",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    ...over,
  };
}

const at = (iso: string) => new Date(`${iso}T09:00:00Z`);

console.log("--- the three-chase sequence, daysBefore 3, repeat 7 ---");
// Heads-up first, on 17 Sep.
check("never chased -> heads-up date", nextReminderOn(item()), "2026-09-17");
check("not due on the 16th", reminderDue(item(), at("2026-09-16")), false);
check("due on the 17th", reminderDue(item(), at("2026-09-17")), true);

// After the heads-up goes out, the next contact is the day itself.
const afterHeadsUp = item({ lastRemindedOn: "2026-09-17" });
check("after heads-up -> the ETA", nextReminderOn(afterHeadsUp), "2026-09-20");
check(
  "no second chase the same week",
  reminderDue(afterHeadsUp, at("2026-09-18")),
  false
);

// After the nudge on the day, it chases weekly.
const afterDueDay = item({ lastRemindedOn: "2026-09-20" });
check("after the ETA nudge -> +7 days", nextReminderOn(afterDueDay), "2026-09-27");
check(
  "still chasing three weeks late",
  nextReminderOn(item({ lastRemindedOn: "2026-10-11" })),
  "2026-10-18"
);

console.log("\n--- a missed run is caught up, never skipped ---");
check(
  "a chase missed for 5 days is still due",
  reminderDue(item({ lastRemindedOn: "2026-09-20" }), at("2026-10-05")),
  true
);

console.log("\n--- the ways a chase stops ---");
check("done stops it", nextReminderOn(item({ status: "done", progress: 100 })), null);
check("cancelled stops it", nextReminderOn(item({ status: "cancelled" })), null);
check("no ETA cannot be chased", nextReminderOn(item({ dueDate: "" })), null);
check(
  "reminders switched off",
  nextReminderOn(item({ reminder: { ...DEFAULT_REMINDER, enabled: false } })),
  null
);
check(
  "repeat 0 chases once on the day and stops",
  nextReminderOn(
    item({
      lastRemindedOn: "2026-09-20",
      reminder: { ...DEFAULT_REMINDER, repeatEveryDays: 0 },
    })
  ),
  null
);
check(
  "no recipients means nobody to chase",
  nextReminderOn(
    item({ reminder: { ...DEFAULT_REMINDER, recipients: [] } })
  ),
  null
);

console.log("\n--- daysBefore 0: the first chase is the day itself ---");
check(
  "daysBefore 0 -> the ETA",
  nextReminderOn(item({ reminder: { ...DEFAULT_REMINDER, daysBefore: 0 } })),
  "2026-09-20"
);
check(
  "and then it goes weekly, not twice on the day",
  nextReminderOn(
    item({
      lastRemindedOn: "2026-09-20",
      reminder: { ...DEFAULT_REMINDER, daysBefore: 0 },
    })
  ),
  "2026-09-27"
);

console.log("\n--- moving the ETA ---");
// Pushed OUT, the schedule fixes itself: the old chase now sits before the new
// heads-up date, so the heads-up is re-issued without anything being cleared.
check(
  "pushed out -> a fresh heads-up for the new date",
  nextReminderOn(item({ dueDate: "2026-10-30", lastRemindedOn: "2026-09-20" })),
  "2026-10-27"
);
// Pulled IN is the case that needs the route to clear lastRemindedOn. Left
// alone, the old chase is already past the new ETA, so it falls through to the
// weekly branch and nobody hears that the date has moved closer.
check(
  "pulled in, stale last-chase -> a week of silence",
  nextReminderOn(item({ dueDate: "2026-09-05", lastRemindedOn: "2026-09-20" })),
  "2026-09-27"
);
check(
  "pulled in, cleared -> chased at once",
  nextReminderOn(item({ dueDate: "2026-09-05", lastRemindedOn: undefined })),
  "2026-09-02"
);

console.log("\n--- progress and status cannot disagree ---");
check("done is forced to 100", normalise(item({ status: "done", progress: 40 })).progress, 100);
check(
  "reopening drops the completed stamp",
  normalise(
    item({ status: "in_progress", progress: 40, completedAt: "2026-09-01T00:00:00Z" })
  ).completedAt,
  undefined
);
check(
  "progress above zero is not 'not started'",
  normalise(item({ status: "not_started", progress: 25 })).status,
  "in_progress"
);
check("progress is clamped", normalise(item({ progress: 250 })).progress, 100);
check("negative progress is clamped", normalise(item({ progress: -10 })).progress, 0);

console.log("\n--- how a date reads ---");
check("overdue reads as late", duePhrase("2026-09-20", -3), "3 days late");
check("one day late is singular", duePhrase("2026-09-20", -1), "1 day late");
check("due today", duePhrase("2026-09-20", 0), "Today");
check("no date", duePhrase("", null), "No date set");

console.log("\n--- the summary tiles ---");
const register = [
  item({ id: "a", dueDate: "2026-09-01" }), // overdue on 10 Sep
  item({ id: "b", dueDate: "2026-09-14" }), // due within 7 days
  item({ id: "c", dueDate: "2026-12-01" }), // open, far off
  item({ id: "d", status: "done", progress: 100 }),
  item({ id: "e", status: "blocked" }),
];
check("summary on 10 Sep", summarise(register, at("2026-09-10")), {
  total: 5,
  open: 4,
  // Only "a". The blocked one is due on 20 Sep, which is not late on the 10th:
  // blocked and overdue are different questions.
  overdue: 1,
  dueThisWeek: 1,
  done: 1,
  blocked: 1,
});

console.log("\n--- form input is clamped, not trusted ---");
check(
  "a nonsense interval is capped",
  parseReminder({ daysBefore: 9999, repeatEveryDays: -5, recipients: ["nope"] }),
  { enabled: true, daysBefore: 60, repeatEveryDays: 0, recipients: ["assignees"] }
);

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILURES`}`);
process.exit(failures === 0 ? 0 : 1);
