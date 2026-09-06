// The review round trip, with no server.
//
//   npx tsx scripts/check-minutes-review.ts
//
// 🔴 The rule that matters: an approval belongs to the DRAFT it was written
// against. If it did not, a secretary could send draft 1, collect approvals,
// rewrite half of it, and walk into signing with approvals for a document
// nobody has read.

import {
  reviewProgress,
  reviewsForDraft,
  isReviewer,
  canSendForReview,
  canReview,
  type MinutesReview,
  type MinutesReviewer,
} from "../lib/minutes";

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
const checkThat = (label: string, cond: boolean) => check(label, cond, true);

const chair: MinutesReviewer = { name: "Dee Schoultz", email: "dee@x.test" };
const principal: MinutesReviewer = { name: "Rob Hutcheon", email: "rob@x.test" };
const both = [chair, principal];

function review(
  who: MinutesReviewer,
  decision: "approved" | "changes_requested",
  draftNumber: number,
  at = "2026-05-10T09:00:00.000Z",
  comments?: string
): MinutesReview {
  return { at, byName: who.name, byEmail: who.email, decision, comments, draftNumber };
}

console.log("\nA round completes only when everyone asked has approved");
{
  const none = reviewProgress(both, [], 1);
  check("nobody has responded", [none.approved, none.total, none.complete], [0, 2, false]);
  check("and both are outstanding", none.waitingOn, ["Dee Schoultz", "Rob Hutcheon"]);

  const one = reviewProgress(both, [review(chair, "approved", 1)], 1);
  check("one approval is not enough", one.complete, false);
  check("the other is named", one.waitingOn, ["Rob Hutcheon"]);

  const all = reviewProgress(both, [review(chair, "approved", 1), review(principal, "approved", 1)], 1);
  check("both approve, the round is complete", [all.approved, all.complete], [2, true]);
  check("nobody outstanding", all.waitingOn, []);
}

console.log("\n\u{1F534} An approval belongs to the draft it answered");
{
  const draft1 = [review(chair, "approved", 1), review(principal, "approved", 1)];
  const onTwo = reviewProgress(both, draft1, 2);
  check("draft 1 approvals do not count for draft 2", [onTwo.approved, onTwo.complete], [0, false]);
  check("everyone is asked again", onTwo.waitingOn, ["Dee Schoultz", "Rob Hutcheon"]);

  // And the history is not thrown away, which is the point of keeping a list.
  check("draft 1 is still on the record", reviewsForDraft(draft1, 1).length, 2);

  const mixed = reviewProgress(both, [...draft1, review(chair, "approved", 2)], 2);
  check("only the draft 2 response counts", [mixed.approved, mixed.waitingOn], [1, ["Rob Hutcheon"]]);
}

console.log("\nOne objection is enough to send it back");
{
  const p = reviewProgress(
    both,
    [review(chair, "approved", 1), review(principal, "changes_requested", 1, "2026-05-10T10:00:00.000Z", "The finance figure is wrong.")],
    1
  );
  check("the round is not complete", p.complete, false);
  check("the objection is surfaced", p.objections.length, 1);
  check("with its comment", p.objections[0].comments, "The finance figure is wrong.");
  // The approval still stands; it just does not finish the round.
  check("the approval is still counted", p.approved, 1);
}

console.log("\nLast word wins for the same person on the same draft");
{
  // A reviewer objects, talks to the secretary, then approves. The stale
  // objection must not hold the round open forever.
  const p = reviewProgress(
    both,
    [
      review(chair, "changes_requested", 1, "2026-05-10T09:00:00.000Z", "Typo"),
      review(chair, "approved", 1, "2026-05-10T11:00:00.000Z"),
      review(principal, "approved", 1),
    ],
    1
  );
  check("the later approval wins", p.complete, true);
  check("the withdrawn objection is not surfaced", p.objections.length, 0);

  // And the other way round: approved, then read it properly and objected.
  const q = reviewProgress(
    both,
    [
      review(chair, "approved", 1, "2026-05-10T09:00:00.000Z"),
      review(chair, "changes_requested", 1, "2026-05-10T11:00:00.000Z", "Actually no"),
      review(principal, "approved", 1),
    ],
    1
  );
  check("the later objection wins", q.complete, false);
  check("and is surfaced", q.objections.length, 1);
}

console.log("\n\u{1F534} Email is a join key, so it must be normalised");
{
  // One pasted trailing space or a capitalised address otherwise reads as a
  // different person and the round never completes.
  const messy: MinutesReview = {
    ...review(chair, "approved", 1),
    byEmail: "  DEE@X.test ",
  };
  const p = reviewProgress(both, [messy, review(principal, "approved", 1)], 1);
  check("case and spacing do not break the match", p.complete, true);

  checkThat("isReviewer normalises too", isReviewer(both, " Rob@X.TEST "));
  check("somebody who was never asked is not a reviewer", isReviewer(both, "nobody@x.test"), false);
  check("a missing address is not a reviewer", isReviewer(both, undefined), false);
  // An empty-string address must not match a reviewer whose address is blank.
  check("blank does not match blank", isReviewer([{ name: "X", email: "" }], ""), false);
}

console.log("\nNobody asked means nothing to wait for, but not 'complete'");
{
  // 🔴 Sending minutes to an empty distribution list must not read as approved.
  const p = reviewProgress([], [], 1);
  check("an empty reviewer list is never complete", p.complete, false);
  check("and shows 0 of 0", [p.approved, p.total], [0, 0]);
}

console.log("\nA review from somebody who was never asked does not count");
{
  const stranger: MinutesReviewer = { name: "Passer By", email: "who@x.test" };
  const p = reviewProgress(both, [review(stranger, "approved", 1), review(chair, "approved", 1)], 1);
  check("only the named reviewers count", p.approved, 1);
  check("the stranger does not complete the round", p.complete, false);
}

console.log("\nWhich statuses allow which move");
{
  check("a draft can be sent", canSendForReview("draft"), true);
  check("so can one that came back", canSendForReview("changes_requested"), true);
  // Pull it back first, so it is obvious the signatures collected no longer apply.
  check("one out for signing cannot", canSendForReview("awaiting_signatures"), false);
  check("one already out for checking cannot", canSendForReview("in_review"), false);
  check("signed cannot", canSendForReview("signed"), false);
  check("archived cannot", canSendForReview("archived"), false);

  check("only a draft out for checking can be reviewed", canReview("in_review"), true);
  check("not a plain draft", canReview("draft"), false);
  check("not one already signed", canReview("signed"), false);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
