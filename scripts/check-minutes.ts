// Proves the minutes rules with no server and no blob.
//
//   npx tsx scripts/check-minutes.ts
//
// Minutes are a legal record a school is required to keep, and a signature on
// one is meant to mean something. The lock and the hash are the two rules
// worth being certain about.

import {
  formatPeriod,
  periodSortKey,
  checkPeriod,
  isLocked,
  signingProgress,
  MINUTES_STATUS_LABELS,
  type MeetingPeriod,
  type MinutesStatus,
  type Signatory,
} from "../lib/minutes";
import { hashDocument, canonicalContent, type MinutesRecord } from "../lib/minutesData";

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.error(`  FAIL ${label}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`);
  }
}
function checkThat(label: string, cond: boolean) {
  check(label, cond, true);
}

console.log("\nPeriods read the way a school would write them");
{
  check("month", formatPeriod({ kind: "month", year: 2026, month: 5 }), "May 2026");
  check("quarter", formatPeriod({ kind: "quarter", year: 2026, quarter: 2 }), "Q2 2026");
  check(
    "custom with a label",
    formatPeriod({ kind: "custom", year: 2026, from: "2026-01-15", to: "2026-03-20", label: "Term 1" }),
    "Term 1"
  );
  check(
    "custom without one falls back to the dates",
    formatPeriod({ kind: "custom", year: 2026, from: "2026-01-15", to: "2026-03-20" }),
    "2026-01-15 to 2026-03-20"
  );
}

console.log("\nMixed period kinds still sort sensibly");
{
  const items: MeetingPeriod[] = [
    { kind: "month", year: 2026, month: 8 },
    { kind: "quarter", year: 2026, quarter: 1 },
    { kind: "month", year: 2026, month: 2 },
    { kind: "custom", year: 2026, from: "2026-11-01", to: "2026-11-30" },
  ];
  const sorted = [...items].sort((a, b) => periodSortKey(a).localeCompare(periodSortKey(b)));
  check(
    "chronological across all three kinds",
    sorted.map(formatPeriod),
    ["Q1 2026", "February 2026", "August 2026", "2026-11-01 to 2026-11-30"]
  );
}

console.log("\nBad periods are refused with something a person can act on");
{
  check("a good month passes", checkPeriod({ kind: "month", year: 2026, month: 5 }), null);
  checkThat("month 13 is refused", !!checkPeriod({ kind: "month", year: 2026, month: 13 }));
  checkThat("month 0 is refused", !!checkPeriod({ kind: "month", year: 2026, month: 0 }));
  checkThat("year 1999 is refused", !!checkPeriod({ kind: "month", year: 1999, month: 5 }));
  checkThat("a far future year is refused", !!checkPeriod({ kind: "month", year: 2200, month: 5 }));
  check("a good quarter passes", checkPeriod({ kind: "quarter", year: 2026, quarter: 4 }), null);
  checkThat(
    "quarter 5 is refused",
    !!checkPeriod({ kind: "quarter", year: 2026, quarter: 5 as 1 })
  );
  check(
    "a good custom range passes",
    checkPeriod({ kind: "custom", year: 2026, from: "2026-01-01", to: "2026-03-31" }),
    null
  );
  checkThat(
    "a backwards range is refused",
    !!checkPeriod({ kind: "custom", year: 2026, from: "2026-03-31", to: "2026-01-01" })
  );
  checkThat(
    "a malformed date is refused",
    !!checkPeriod({ kind: "custom", year: 2026, from: "March", to: "2026-01-01" })
  );
}

console.log("\n🔴 The lock. Signed minutes cannot change.");
{
  const states: MinutesStatus[] = [
    "draft", "in_review", "changes_requested", "awaiting_signatures", "signed", "archived",
  ];
  for (const s of states) {
    const shouldLock = s === "signed" || s === "archived";
    check(`${s} locked? ${shouldLock}`, isLocked(s), shouldLock);
  }
  checkThat("every status has a label", states.every((s) => !!MINUTES_STATUS_LABELS[s]));
}

console.log("\nSigning progress");
{
  const sig = (name: string, signed = false): Signatory => ({
    personId: name,
    name,
    email: `${name}@example.test`,
    role: "other",
    ...(signed ? { signedAt: "2026-09-06T10:00:00.000Z" } : {}),
  });

  check("nobody yet", signingProgress([sig("A"), sig("B")]).complete, false);
  check("one of two", signingProgress([sig("A", true), sig("B")]).signed, 1);
  check("waiting on the right person", signingProgress([sig("A", true), sig("B")]).waitingOn, ["B"]);
  check("all signed", signingProgress([sig("A", true), sig("B", true)]).complete, true);
  // 🔴 Nobody signing must NOT read as complete, or a set of minutes with no
  // signatories at all would close itself.
  check("no signatories is not complete", signingProgress([]).complete, false);
}

console.log("\n🔴 The hash. This is what makes a signature mean anything.");
{
  const base: MinutesRecord = {
    id: "m1",
    title: "SGB meeting",
    body: "sgb",
    period: { kind: "month", year: 2026, month: 5 },
    status: "awaiting_signatures",
    sections: [
      { id: "s1", title: "Finance report", body: "Budget approved.", order: 1 },
      { id: "s2", title: "Principal's report", body: "Enrolment steady.", order: 2 },
    ],
    signatories: [],
    reviews: [],
    draftNumber: 1,
    createdAt: "2026-09-01T00:00:00.000Z",
    createdBy: "sec@example.test",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };

  const h = hashDocument(canonicalContent(base));
  check("a hash is 64 hex characters", /^[0-9a-f]{64}$/.test(h), true);
  check("the same content hashes the same", hashDocument(canonicalContent(base)), h);

  const edited = { ...base, sections: [
    { ...base.sections[0], body: "Budget REJECTED." }, base.sections[1],
  ] };
  checkThat("changing a section changes the hash", hashDocument(canonicalContent(edited)) !== h);

  // Reordering changes what the meeting appears to have discussed, so it must
  // change the hash too.
  const reordered = { ...base, sections: [
    { ...base.sections[0], order: 2 }, { ...base.sections[1], order: 1 },
  ] };
  checkThat("reordering sections changes the hash", hashDocument(canonicalContent(reordered)) !== h);

  const retitled = { ...base, title: "FINCOM meeting" };
  checkThat("changing the title changes the hash", hashDocument(canonicalContent(retitled)) !== h);

  const reperiod = { ...base, period: { kind: "month", year: 2026, month: 6 } as MeetingPeriod };
  checkThat("changing the period changes the hash", hashDocument(canonicalContent(reperiod)) !== h);

  // Things that are NOT the content must not change it, or a signature would
  // break for reasons nobody can explain.
  const touched = { ...base, updatedAt: "2026-12-25T00:00:00.000Z" };
  check("touching updatedAt does not change the hash", hashDocument(canonicalContent(touched)), h);

  checkThat("a Buffer hashes too", /^[0-9a-f]{64}$/.test(hashDocument(Buffer.from("a docx"))));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
