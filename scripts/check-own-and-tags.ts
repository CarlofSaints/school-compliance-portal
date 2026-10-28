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
  check("adding yourself in the same save still needs a reason", F.isNotOwnerStatusChange(action, { status: "done", assigneeIds: ["p-owner", "p-other"] }, ["p-other"]), true);
  check("taking yourself off in the same save needs a reason", F.isNotOwnerStatusChange(action, { status: "done", assigneeIds: [] }, ["p-owner"]), true);
  const withLine = F.withHistoryLine({ status: "done" }, { id: "u", name: "Admin" }, "", "owner left")({ ...(action as object), updates: [] } as never);
  check("reason lands on a history line, as saved (done = 100%)", [withLine.updates?.[0].notOwnerReason, withLine.updates?.[0].status, withLine.updates?.[0].progress], ["owner left", "done", 100]);

  const { isRegisterImport } = await import("../lib/approvalEngine");
  check("untouched import is a register row", isRegisterImport(imported), true);
  const edited: { submittedBy: string; importBatchId?: string } = { submittedBy: "carl" }; // the first edit clears importBatchId
  check("edited import is an ordinary application: the importer is its submitter", isOwnApplication(edited, "carl"), true);
  check("edited import in a band with NO approvers is not a register row", isRegisterImport(edited), false);
  const legacy = { ...imported, requiredApprovers: [{ userId: "boss" }] };
  check("import put to a vote before the flag existed: the importer stays blocked", isOwnApplication(legacy, "carl"), true);

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
  const S = await import("../lib/spendData");
  const row = (id: string, extra: object) => ({ id, projectName: id, submittedBy: "carl", status: "pending", approvals: [], ...extra }) as never;
  await S.createSpendApplications([
    row("untouched", { importBatchId: "b9" }),
    row("voted-legacy", { importBatchId: "b9", requiredApprovers: [{ userId: "boss" }] }),
    row("completed-from-grid", { importBatchId: "b9" }),
    row("by-hand", {}),
  ]);
  // Any later write stamps a rev: here the legacy edit and a grid completion.
  await S.updateSpendApplication("voted-legacy", { requiredApprovers: [{ userId: "boss" }] } as never);
  await S.updateSpendApplication("completed-from-grid", { status: "completed" } as never);
  check("Undo import removes only rows nobody has changed since", await S.deleteSpendImportBatch("b9"), 1);
  check("...a row completed from the grid is kept", !!(await S.getSpendById("completed-from-grid")), true);
  check("...a row already put to a vote is kept", !!(await S.getSpendById("voted-legacy")), true);
  // Changed by someone else since you opened it: refused, nothing written.
  await S.createSpendApplications([row("busy", { description: "old" })]);
  const opened = await S.getSpendById("busy");
  const base = { projectName: opened?.projectName, description: opened?.description };
  check("first save on what you opened works", !!(await S.updateSpendApplication("busy", { projectName: "Dee's" } as never, { base, byName: "Dee" })), true);
  let conflict: unknown = null;
  try {
    await S.updateSpendApplication("busy", { projectName: "Carl's" } as never, { base, byName: "Carl" });
  } catch (e) {
    conflict = e;
  }
  check("a save over someone else's change is refused, with their version", conflict instanceof S.SpendEditConflict && (conflict as InstanceType<typeof S.SpendEditConflict>).current.changedByName, "Dee");
  check("...and nothing was overwritten", (await S.getSpendById("busy"))?.projectName, "Dee's");
  await S.updateSpendApplication("busy", { notes: [] } as never, { byName: "Approver" });
  const fresh = await S.getSpendById("busy");
  check("a note meanwhile does not refuse an edit of other fields", !!(await S.updateSpendApplication("busy", { description: "new" } as never, { base: { projectName: fresh?.projectName, description: fresh?.description } })), true);
  console.log(failures ? `\n${failures} FAILED` : "\nall passed");
  process.exit(failures ? 1 : 0);
}
main();
