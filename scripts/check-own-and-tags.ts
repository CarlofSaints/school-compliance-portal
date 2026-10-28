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
  const own = { submittedBy: "carl", applicantUserId: "carl", submittedOnBehalf: false };
  const behalf = { submittedBy: "carl", applicantUserId: "dee", submittedOnBehalf: true };
  const old = { submittedBy: "carl", applicantUserId: undefined, submittedOnBehalf: undefined };
  check("own application is own", isOwnApplication(own, "carl"), true);
  check("captured for someone else is NOT the submitter's", isOwnApplication(behalf, "carl"), false);
  check("...but is the applicant's", isOwnApplication(behalf, "dee"), true);
  check("older record with no applicant id: submitter is the applicant", isOwnApplication(old, "carl"), true);
  const approver = { id: "carl", permissions: ["approve_spend"] };
  check("on-behalf submitter who is an approver may act", mayActOnApproved({ ...behalf, requiredApprovers: [{ userId: "carl" }] } as never, approver), true);
  check("own submitter who is an approver may not", mayActOnApproved({ ...own, requiredApprovers: [{ userId: "carl" }] } as never, approver), false);

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
    console.log("SKIP  tag counts: fake store paths differ from users.json/people.json");
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
