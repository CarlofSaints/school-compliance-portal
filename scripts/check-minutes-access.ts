// Checks who may read minutes (lib/minutesAccessRules.ts) and the own-email
// change link (lib/emailChange.ts). No server, no blob, nothing sent.
//
//   npx tsx scripts/check-minutes-access.ts
export {};

process.env.AUTH_SECRET = "check-minutes-access-secret";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`
  );
}

async function main() {
  const { canReadMinutes, effectiveAccess } = await import("../lib/minutesAccessRules");
  const { createEmailChangeToken, verifyEmailChangeToken, readEmailChangeClaims, EMAIL_CHANGE_TTL_MS } =
    await import("../lib/emailChange");

  const FINCOM = "tag-fincom";
  const FINCOM_CC = "tag-fincom-cc";
  const SGB = "tag-sgb";
  const distribution = { to: { fincom: FINCOM, sgb: SGB }, cc: { fincom: FINCOM_CC } };
  const none = { to: {}, cc: {} };

  const member = { email: "teacher@school.co.za", permissions: ["view_dashboard"], tagIds: [] as string[] };
  const fincomMember = { ...member, email: "treasurer@school.co.za", tagIds: [FINCOM] };
  const fincomCc = { ...member, email: "bursar@school.co.za", tagIds: [FINCOM_CC] };
  const admin = { ...member, email: "sec@school.co.za", permissions: ["manage_minutes"] };
  const userAdmin = { ...member, email: "it@school.co.za", permissions: ["manage_users"] };

  const fincomSet = { body: "fincom" as const, reviewers: [{ email: "chair@school.co.za" }], signatories: [{ email: "Principal@School.co.za " }] };
  const sgbSet = { body: "sgb" as const };
  const otherSet = { body: "other" as const };
  const read = (rec: typeof fincomSet | typeof sgbSet | typeof otherSet, v: typeof member, settings = {}, dist: typeof distribution | typeof none = distribution) =>
    canReadMinutes(rec, v, effectiveAccess(rec.body, settings, dist));

  // --- defaults ---
  check("FINCOM default: an ordinary member cannot read", read(fincomSet, member), false);
  check("FINCOM default: a FINCOM (To) member can", read(fincomSet, fincomMember), true);
  check("FINCOM default: a FINCOM (Cc) member can", read(fincomSet, fincomCc), true);
  check("SGB default: everyone signed in can", read(sgbSet, member), true);
  check("Other default: everyone signed in can", read(otherSet, member), true);
  check("default is reported as default", effectiveAccess("fincom", {}, distribution).isDefault, true);

  // --- always allowed ---
  check("minutes admin reads FINCOM", read(fincomSet, admin), true);
  check("user admin reads FINCOM", read(fincomSet, userAdmin), true);
  check("a reviewer of THIS set reads it", read(fincomSet, { ...member, email: "chair@school.co.za" }), true);
  check("a signatory reads it (case and spaces ignored)", read(fincomSet, { ...member, email: "principal@school.co.za" }), true);

  // --- fails closed ---
  check("FINCOM with NO distribution list: member cannot read", read(fincomSet, member, {}, none), false);
  check("FINCOM with NO distribution list: still not opened to anyone tagged", read(fincomSet, fincomMember, {}, none), false);
  check("'tags' with no tags chosen: member cannot read", read(sgbSet, member, { sgb: { mode: "tags", tagIds: [] } }), false);
  check("a viewer with no email is not matched as a reviewer", canReadMinutes({ body: "fincom", reviewers: [{ email: "" }] }, { ...member, email: "" }, { mode: "tags", tagIds: [] }), false);
  check("an unknown saved mode falls back to the default, not open", read(fincomSet, member, { fincom: { mode: "public", tagIds: [] } as never }), false);

  // --- admin overrides ---
  check("admin opens FINCOM to everyone", read(fincomSet, member, { fincom: { mode: "everyone", tagIds: [] } }), true);
  check("admin limits SGB to the SGB tag: member out", read(sgbSet, member, { sgb: { mode: "tags", tagIds: [SGB] } }), false);
  check("admin limits SGB to the SGB tag: SGB holder in", read(sgbSet, { ...member, tagIds: [SGB] }, { sgb: { mode: "tags", tagIds: [SGB] } }), true);
  check("a saved FINCOM list replaces the distribution default", read(fincomSet, fincomCc, { fincom: { mode: "tags", tagIds: [FINCOM] } }), false);

  // --- email change link ---
  const user = { id: "u1", password: "$2a$10$hashONE", email: "old@school.co.za" };
  const now = Date.parse("2026-10-09T10:00:00Z");
  const token = createEmailChangeToken(user, "  New@School.co.za ", now);
  check("the link names the new address, normalised", readEmailChangeClaims(token)?.n, "new@school.co.za");
  check("a fresh link is valid", verifyEmailChangeToken(token, user, now), "valid");
  check("expired after 24 hours", verifyEmailChangeToken(token, user, now + EMAIL_CHANGE_TTL_MS + 1), "expired");
  check("dies when the password changes", verifyEmailChangeToken(token, { ...user, password: "$2a$10$hashTWO" }, now), "invalid");
  check("dies once the email has changed (cannot be replayed)", verifyEmailChangeToken(token, { ...user, email: "new@school.co.za" }, now), "invalid");
  check("not usable on another account", verifyEmailChangeToken(token, { ...user, id: "u2" }, now), "invalid");
  const forged = Buffer.from(JSON.stringify({ u: "u1", n: "chair@school.co.za", e: now + 1000 })).toString("base64url") + "." + token.split(".")[1];
  check("swapping in another address breaks the signature", verifyEmailChangeToken(forged, user, now), "invalid");
  check("rubbish is invalid", verifyEmailChangeToken("nope", user, now), "invalid");

  // --- review fixes: register links, actions from restricted meetings ---
  const { readerForUser, actionVisible } = await import("../lib/minutesAccess");
  type P = import("../lib/peopleData").Person;
  const person = (over: Partial<P>): P => ({ id: "p", name: "X", email: "", userId: null, tagIds: [], ...over }) as P;
  const ctx = {
    settings: {},
    distribution,
    people: [
      person({ id: "p-sneaky", email: "teacher@school.co.za", userId: null, tagIds: [FINCOM] }),
      person({ id: "p-treasurer", email: "treasurer@school.co.za", userId: "u-treasurer", tagIds: [FINCOM] }),
      person({ id: "p-teacher", email: "teacher@school.co.za", userId: "u-teacher", tagIds: [] }),
    ],
  };
  const teacher = readerForUser({ id: "u-teacher", email: "teacher@school.co.za", tagIds: [] }, ["view_dashboard"], ctx);
  const treasurer = readerForUser({ id: "u-treasurer", email: "treasurer@school.co.za", tagIds: [] }, ["view_dashboard"], ctx);
  check("a register entry with MY email but not linked to me gives me no tags", teacher.viewer.tagIds, []);
  check("a register entry LINKED to my login gives me its tags", treasurer.viewer.tagIds, [FINCOM]);
  check(
    "so an unlinked FINCOM entry with my email does not open FINCOM",
    canReadMinutes(fincomSet, teacher.viewer, effectiveAccess("fincom", {}, distribution)),
    false
  );

  const byId = new Map<string, typeof fincomSet | typeof sgbSet>([
    ["m-fincom", fincomSet],
    ["m-sgb", sgbSet],
  ]);
  const fromFincom = { fromMinutes: { minutesId: "m-fincom" }, assigneeIds: ["p-somebody"] };
  check("an action from FINCOM minutes is hidden from a non-FINCOM member", actionVisible(fromFincom, teacher, byId, ctx), false);
  check("...but shown to a FINCOM member", actionVisible(fromFincom, treasurer, byId, ctx), true);
  check("...and shown to the person carrying it", actionVisible({ ...fromFincom, assigneeIds: ["p-teacher"] }, teacher, byId, ctx), true);
  check("an action from SGB minutes is shown to everyone", actionVisible({ fromMinutes: { minutesId: "m-sgb" }, assigneeIds: [] }, teacher, byId, ctx), true);
  check("an action not from any meeting is shown to everyone", actionVisible({ assigneeIds: [] }, teacher, byId, ctx), true);
  check("an action whose minutes were deleted is shown", actionVisible({ fromMinutes: { minutesId: "gone" }, assigneeIds: [] }, teacher, byId, ctx), true);

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
