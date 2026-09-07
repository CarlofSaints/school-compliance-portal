// Sending signed minutes to the governing body, and raising actions from a
// minute. No server.
//
//   npx tsx scripts/check-minutes-distribution.ts
//
// 🔴 The two rules that matter:
//
//   1. "Signed" is not the only closed state. A school that signs on PAPER
//      never passes through the signing route, so before the send button
//      those minutes reached nobody at all.
//   2. An action's origin is resolved from the MINUTES, never taken from the
//      caller - an action item's whole authority is "the SGB minuted this".

import {
  canDistribute,
  audienceForBody,
  AUDIENCE_LABELS,
  type MinutesStatus,
} from "../lib/minutes";

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.error(
      `  FAIL ${label}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`
    );
  }
}
const checkThat = (label: string, cond: boolean) => check(label, cond, true);

console.log("\nOnly finished minutes go out as final");
{
  const drafts: MinutesStatus[] = [
    "draft",
    "in_review",
    "changes_requested",
    "awaiting_signatures",
  ];
  for (const s of drafts) {
    check(`${s} cannot be distributed`, canDistribute(s, false), false);
  }
  checkThat("signed can be", canDistribute("signed", false));

  // ⚠️ Nothing in the app SETS "archived" today - it is a declared status with
  // no writer - so this is a rule waiting for a feature rather than one in
  // force. Pinned here so whoever adds archiving has to decide deliberately.
  //
  // 🔴 Archived is NOT the same as signed, though isLocked treats them alike.
  // A draft can be archived without ever being agreed, and circulating that as
  // the final record of a meeting is precisely the mistake this guards. An
  // archived set that WAS signed still carries its signatures, so it passes on
  // that count and not on being archived.
  check(
    "archived on its own is not enough - it is not proof of signing",
    canDistribute("archived", false),
    false
  );
  checkThat(
    "archived minutes with a signed copy can still be re-sent",
    canDistribute("archived", true)
  );
}

console.log("\n🔴 Wet ink closes minutes without the status ever reaching signed");
{
  // This is the case the button exists for. The upload route sets no status,
  // so a school that signs on paper had NOTHING distribute its minutes.
  checkThat(
    "awaiting_signatures + a scan is distributable",
    canDistribute("awaiting_signatures", true)
  );
  checkThat("a draft + a scan is distributable", canDistribute("draft", true));
  check(
    "but a draft with no scan is still not",
    canDistribute("draft", false),
    false
  );
}

console.log("\nThe distribution list follows the MEETING, not the status");
{
  check("FINCOM minutes go to the FINCOM list", audienceForBody("fincom"), "fincom");
  check("SGB minutes go to the SGB list", audienceForBody("sgb"), "sgb");
  // 🔴 "Other" must not silently fall through to nothing. A school minuting a
  // disciplinary panel still has to be able to circulate it, and the SGB list
  // is the only defensible default - the alternative is minutes that reach
  // nobody with no error to explain why.
  check("anything else falls back to the SGB list", audienceForBody("other"), "sgb");

  // The panel and the refusal message both name the audience out loud, so a
  // secretary is told WHICH list is unconfigured rather than "nobody is set
  // up". Every audience must therefore have a label.
  for (const a of ["draft", "signing", "signed", "sgb", "fincom"] as const) {
    checkThat(`${a} has a label to name it by`, !!AUDIENCE_LABELS[a]);
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
