// The spend "own application" rule and the tag counts, against the FAKE store.
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-own-and-tags.ts

export {};
for (const k of ["BLOB_READ_WRITE_TOKEN", "CONTROL_BLOB_READ_WRITE_TOKEN", "TENANT_SECRET", "MULTI_TENANT"]) delete process.env[k];
process.env.NEXT_PUBLIC_SCHOOL ||= "hvps";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`);
}

async function main() {
  const { createRequire } = await import("module");
  const blob = createRequire(__filename)("@vercel/blob") as { __fakeStore?: () => unknown };
  if (typeof blob.__fakeStore !== "function") {
    console.error("Refusing to run: @vercel/blob is the REAL store. Run with --import ./scripts/fake-blob/register.mjs");
    process.exit(1);
  }
  const { isOwnApplication, mayActOnApproved } = await import("../lib/approvalEngine");
  const own = { submittedBy: "carl", applicantUserId: "carl" };
  const forDee = { submittedBy: "carl", applicantUserId: "dee", submittedOnBehalf: true };
  const typedName = { submittedBy: "carl", applicantUserId: undefined, submittedOnBehalf: true };
  const old = { submittedBy: "carl" };
  const imported = { submittedBy: "carl", importBatchId: "b1" };
  check("own application is own", isOwnApplication(own, "carl"), true);
  check("picking another user as applicant does not let the submitter off (unchecked say-so)", isOwnApplication(forDee, "carl"), true);
  check("...but is the applicant's", isOwnApplication(forDee, "dee"), true);
  check("'on behalf' with a typed-in name is still the submitter's", isOwnApplication(typedName, "carl"), true);
  check("older record with no applicant id: submitter is the applicant", isOwnApplication(old, "carl"), true);
  check("imported row is not the importer's", isOwnApplication(imported, "carl"), false);
  const approver = { id: "carl", permissions: ["approve_spend"] };
  check("submitter who is an approver may not act on it", mayActOnApproved({ ...forDee, requiredApprovers: [{ userId: "carl" }] } as never, approver), false);
  check("submitter may still close an imported / no-approver row", mayActOnApproved({ ...typedName, requiredApprovers: [] } as never, approver), true);
  check("own submitter who is an approver may not", mayActOnApproved({ ...own, requiredApprovers: [{ userId: "carl" }] } as never, approver), false);

  const F = await import("../lib/actionItemFields");
  const action = { status: "in_progress", progress: 40, assigneeIds: ["p-owner"] } as never;
  check("non-owner moving status needs a reason", F.isNotOwnerStatusChange(action, { status: "done" }, ["p-other"]), true);
  check("owner moving status does not", F.isNotOwnerStatusChange(action, { status: "done" }, ["p-owner"]), false);
  check("non-owner saving the same status does not", F.isNotOwnerStatusChange(action, { status: "in_progress", progress: 40 }, []), false);
  const withLine = F.withHistoryLine({ status: "done" }, { id: "u", name: "Admin" }, "", "owner left")({ ...(action as object), updates: [] } as never);
  check("reason lands on a history line, as saved (done = 100%)", [withLine.updates?.[0].notOwnerReason, withLine.updates?.[0].status, withLine.updates?.[0].progress], ["owner left", "done", 100]);

  check("edited imported row put to a vote is the importer's own again", isOwnApplication({ ...imported, requiredApprovers: [{ userId: "boss" }] }, "carl"), true);
  const A = await import("../lib/actionItems");
  const act = { status: "in_progress", progress: 40, assigneeIds: [] } as never;
  check("not started at 40% is no move (saved as in progress)", A.movesStatus(act, { status: "not_started" }), false);
  check("done is a move", A.movesStatus(act, { status: "done" }), true);
  const R = await import("../lib/actionItemRecipients");
  const reg = [
    { id: "p-linked-other", userId: "dee", email: "bob@x.co" },
    { id: "p-unlinked", email: "Bob@x.co " },
    { id: "p-mine", userId: "bob" },
  ];
  check("owner: own link or unlinked entry with my email, never someone else's linked entry", R.myPersonIdsIn(reg, { id: "bob", email: "bob@x.co" }), ["p-unlinked", "p-mine"]);

  const { writeJson } = await import("../lib/controlData");
  const { getTagCounts, getTagMembers } = await import("../lib/tagData");
  const { getUsers } = await import("../lib/userData");
  const { getPeople } = await import("../lib/peopleData");
  await writeJson("users.json", [
    { id: "u-dee", name: "Dee", surname: "S", email: "dee@x.co", tagIds: [] },
    { id: "u-fin", name: "Fin", surname: "C", email: "fin@x.co", tagIds: ["fincom"] },
  ]);
  await writeJson("people.json", [
    { id: "p-dee", name: "Dee S", userId: "u-dee", tagIds: ["sign"] },
    { id: "p-dee2", name: "Dee again", userId: "u-dee", tagIds: ["sign"] },
    { id: "p-fin", name: "Fin C", userId: "u-fin", tagIds: ["fincom"] },
    { id: "p-nologin", name: "Parent", tagIds: ["sign"] },
  ]);
  const users = await getUsers();
  const people = await getPeople();
  if (!users.length || !people.length) {
    failures++;
    console.log("FAIL  tag counts did not run: fake store paths differ from users.json/people.json");
  } else {
    const counts = await getTagCounts();
    check("tag on a linked person's register entry is counted", counts.sign, (await getTagMembers("sign")).length);
    check("...once per person", counts.sign, 2);
    check("tagged on both sides counts once", counts.fincom, 1);
  }
  console.log(failures ? `\n${failures} FAILED` : "\nall passed");
  process.exit(failures ? 1 : 0);
}
main();
