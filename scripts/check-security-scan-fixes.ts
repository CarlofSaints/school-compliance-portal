// Checks the fixes from the 19 Oct 2026 security scan: the minutes signing
// code is keyed and never leaves the server, unsafe storage paths are refused,
// and the school name of a public sign-up cannot carry markup. Batch 2: CSV
// cells, sign-in counting and timing, spend quote rights, signature files,
// PDF page count, tag members, and restricted-minutes actions.
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-security-scan-fixes.ts
import crypto from "crypto";
import fs from "fs";

process.env.AUTH_SECRET = "check-scan-fixes-secret";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`
  );
}

async function main() {
  const { hashSigningCode, signingCodeMatches, minutesForClient } = await import("../lib/minutesSigning");
  const { readJson, readFile, writeJson, UnsafeBlobPathError } = await import("../lib/controlData");

  // --- signing code ---
  const id = "11111111-1111-4111-8111-111111111111";
  const plain = crypto.createHash("sha256").update(`${id}:ABC234`).digest("hex");
  check("stored hash is no longer the plain SHA-256", hashSigningCode("ABC234", id) === plain, false);
  check("the right code matches", signingCodeMatches("abc234", id, hashSigningCode("ABC234", id)), true);
  check("a wrong code does not", signingCodeMatches("ABC235", id, hashSigningCode("ABC234", id)), false);
  check("an old-style (leaked) hash no longer signs", signingCodeMatches("ABC234", id, plain), false);
  check("nothing stored, nothing matches", signingCodeMatches("ABC234", id, undefined), false);

  const record = {
    id,
    signatories: [
      { personId: "p1", role: "chair", email: "chair@x.za", name: "Chair", codeHash: "aa", ip: "1.2.3.4", codeSentAt: "2026-10-19" },
    ] as unknown as import("../lib/minutes").Signatory[],
  };
  const out = minutesForClient(record) as unknown as { signatories: Record<string, unknown>[] };
  check("client copy has no code hash or IP", ["codeHash", "ip"].filter((k) => k in out.signatories[0]), []);
  check("client copy keeps the rest", out.signatories[0].codeSentAt, "2026-10-19");
  check("stored record is untouched", record.signatories[0].codeHash, "aa");
  check("null passes through", minutesForClient(null), null);

  // --- storage paths ---
  // A read of an unsafe path is a miss (the route says 404); a write throws.
  await writeJson("users/index.json", { secret: true });
  const read = (p: string) => readJson(p, "MISSING");
  check("'..' segment reads as missing", await read("policies/../users/index.json"), "MISSING");
  check("'%2e%2e' segment reads as missing", await read("policies/%2e%2e/users/index.json"), "MISSING");
  check("'%2E.' segment reads as missing", await read("policies/%2E./users/index.json"), "MISSING");
  check("'..' between backslashes reads as missing", await read("policies\\..\\users/index.json"), "MISSING");
  check("a tab inside '..' reads as missing", await read("policies/.\t./users/index.json"), "MISSING");
  check("a newline inside '..' reads as missing", await read("policies/.\n./users/index.json"), "MISSING");
  check("readFile on a bad path is a miss",await readFile("policies/../users/index.json"), null);
  async function writeRefused(p: string) {
    try {
      await writeJson(p, {});
      return false;
    } catch (e) {
      return e instanceof UnsafeBlobPathError;
    }
  }
  check("writing through '..' is refused", await writeRefused("policies/../users/index.json"), true);
  check("an ordinary path still reads", await read("users/index.json"), { secret: true });
  check("a dotted file name is fine", await writeRefused("compliance/x/report.v2.pdf"), false);
  check("a tab inside a file name is fine", await writeRefused("compliance/x/a\tb.pdf"), false);
  check("a backslash inside a file name is fine",await writeRefused("compliance/x/budget\\2026.pdf"), false);

  // --- sign-up name ---
  process.env.VERCEL_API_TOKEN ||= "x";
  process.env.VERCEL_TEAM_ID ||= "x";
  process.env.VERCEL_PROVISIONING_PROJECT_ID ||= "x";
  const { validateNewSchool } = await import("../lib/provisioning");
  const bad = await validateNewSchool({ name: "<a href='https://evil.example'>Verify</a>", key: "abc-school", adminEmail: "a@b.co.za" });
  check("markup in a school name is refused", bad?.reason, "invalid");
  const long = await validateNewSchool({ name: "x".repeat(101), key: "abc-school", adminEmail: "a@b.co.za" });
  check("a 101-character name is refused", long?.reason, "invalid");

  // ===== batch 2 =====

  // --- CSV cells (every CSV export) ---
  const { csvCell } = await import("../lib/csv");
  check("a formula gets a leading quote", csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  check("@, + and - formulas too", [csvCell("@SUM(A1)"), csvCell("+A1"), csvCell("-A1")], [`"'@SUM(A1)"`, `"'+A1"`, `"'-A1"`]);
  check("a leading tab or CR too", [csvCell("\t=1"), csvCell("\r=1")], [`"'\t=1"`, `"'\r=1"`]);
  check("a plain negative number is left alone", csvCell("-500"), `"-500"`);
  check("a phone number is left alone", csvCell("+27 82 123 4567"), `"+27 82 123 4567"`);
  check("null is an empty cell", csvCell(null), `""`);
  const pages = ["app/(portal)/action-items/page.tsx", "app/(portal)/spend/page.tsx", "lib/activityLog.ts"];
  check("every CSV export uses csvCell", pages.filter((f) => !fs.readFileSync(f, "utf8").includes("csvCell")), []);

  // --- sign-in counting: parallel attempts on one account ---
  const { LIMITS, hit } = await import("../lib/rateLimit");
  const quiet = console.error;
  console.error = () => {};
  const burst = await Promise.all(Array.from({ length: 30 }, () => hit(LIMITS.loginAccount, "burst@school.co.za")));
  console.error = quiet;
  check("30 attempts at once: no more than 5 get through", burst.filter((r) => r.ok).length <= LIMITS.loginAccount.max, true);
  check("per-account and code limits refuse on contention", [LIMITS.loginAccount, LIMITS.resetRequestEmail, LIMITS.signCodeAttempt].every((l) => l.failClosed), true);
  check("every per-IP limit fails OPEN (one school NAT)", [LIMITS.loginIp, LIMITS.resetRequestIp, LIMITS.resetCompleteIp, LIMITS.confirmEmailIp].map((l) => "failClosed" in l), [false, false, false, false]);
  console.error = () => {};
  const nat = await Promise.all(Array.from({ length: 30 }, () => hit(LIMITS.loginIp, "10.0.0.1")));
  console.error = quiet;
  check("the per-IP limit still counts under contention", nat.some((r) => !r.ok) && Math.max(...nat.map((r) => r.count ?? 0)) > LIMITS.loginIp.max, true);
  const auth = fs.readFileSync("app/api/auth/route.ts", "utf8");
  check("sign-in counts the account BEFORE checking the password", auth.indexOf("hit(LIMITS.loginAccount") < auth.indexOf("verifyPassword(user"), true);
  check("sign-in no longer peeks", /\bpeek\(/.test(auth), false);

  // --- sign-in and reset timing ---
  const bcrypt = (await import("bcryptjs")).default;
  const { verifyPassword, getUserByEmail } = await import("../lib/userData");
  const real = { id: "u1", email: "a@school.co.za", password: await bcrypt.hash("right-one", 10) } as never;
  check("no account: the compare still runs and fails", await verifyPassword(undefined, "not-a-real-password"), false);
  check("right password still signs in", await verifyPassword(real, "right-one"), true);
  check("wrong password still fails", await verifyPassword(real, "wrong"), false);
  const empty = { id: "u2", email: "e@school.co.za", password: "" } as never;
  check("a real user with an empty password never signs in", await verifyPassword(empty, "not-a-real-password"), false);
  check("...not even with an empty password typed", await verifyPassword(empty, ""), false);
  await writeJson("users.json", []);
  await writeJson("users/u9/record.json", { id: "u9", email: "lost@school.co.za", name: "L", surname: "S", password: "x", role: "r" });
  check("index-only lookup skips the slow scan", await getUserByEmail("lost@school.co.za", false), undefined);
  check("the full lookup still recovers it", (await getUserByEmail("lost@school.co.za"))?.id, "u9");
  const forgot = fs.readFileSync("app/api/auth/forgot-password/route.ts", "utf8");
  check("forgot-password looks up and sends after the reply", forgot.indexOf("afterResponse(") < forgot.indexOf("getUserByEmail("), true);
  check("forgot-password: per-user failures have one answer", /status: 502/.test(forgot), false);
  check("forgot-password: no email set up is a 503 for every address, before any lookup", forgot.indexOf("status: 503") > 0 && forgot.indexOf("status: 503") < forgot.indexOf("getUserByEmail("), true);
  check("index miss: a counter that could not be saved still allows the scan", auth.includes("scan.count === undefined || scan.count === 1"), true);
  check("index miss: the address is counted only after a wrong or unknown answer", /if \(!user \|\| !valid\) \{\s*accountHit \?\?= await hit\(LIMITS\.loginAccount/.test(auth), true);
  check("an index miss scans INLINE, before the password is checked", auth.indexOf("hit(INDEX_REPAIR, account)") > 0 && auth.indexOf("user = await getUserByEmail(email);") > 0 && auth.indexOf("user = await getUserByEmail(email);") < auth.indexOf("verifyPassword(user"), true);

  // --- spend: who may act on an approved application ---
  const { mayActOnApproved } = await import("../lib/approvalEngine");
  const approvedApp = { submittedBy: "sub", applicantUserId: "appl", requiredApprovers: [{ userId: "boss" }] } as never;
  check("the submitter may not", mayActOnApproved(approvedApp, { id: "sub", permissions: ["manage_spend_settings"] }), false);
  check("the applicant may not", mayActOnApproved(approvedApp, { id: "appl", permissions: ["manage_spend_settings"] }), false);
  check("a required approver may", mayActOnApproved(approvedApp, { id: "boss", permissions: ["approve_spend"] }), true);
  check("a spend admin with approve_spend may", mayActOnApproved(approvedApp, { id: "adm", permissions: ["approve_spend", "manage_spend_settings"] }), true);
  check("a spend admin without approve_spend may not (the route requires it)", mayActOnApproved(approvedApp, { id: "adm", permissions: ["manage_spend_settings"] }), false);
  check("approve_spend alone is not enough", mayActOnApproved(approvedApp, { id: "x", permissions: ["approve_spend"] }), false);
  const { quoteBandProblem } = await import("../lib/approvalSettings");
  const bands = [
    { id: "low", label: "", minAmount: 0, maxAmount: 5000, logOnly: true, requirements: [] },
    { id: "mid", label: "", minAmount: 5000, maxAmount: 10000, logOnly: false, requirements: [] },
    { id: "high", label: "", minAmount: 10000, maxAmount: null, logOnly: false, requirements: [] },
  ];
  check("a quote above approval in the same band is allowed", quoteBandProblem(bands, 9000, 6000), null);
  check("a quote below approval is allowed", quoteBandProblem(bands, 4000, 6000), null);
  check("a quote that lands in a higher band is refused", typeof quoteBandProblem(bands, 12000, 6000), "string");
  check("no bands set up: allowed", quoteBandProblem([], 12000, 6000), null);
  check("the FROZEN band decides: same band today, different band at approval, refused", typeof quoteBandProblem(bands, 9000, 6000, "low"), "string");
  check("the frozen band matches: allowed", quoteBandProblem(bands, 12000, 11000, "high"), null);
  check("no approved or estimated amount: refused", typeof quoteBandProblem(bands, 100, undefined), "string");
  const selectQuote = fs.readFileSync("app/api/spend/[id]/select-quote/route.ts", "utf8");
  check("quote index must be a whole number", selectQuote.includes("Number.isInteger(quoteIndex)"), true);
  const usersRoute = fs.readFileSync("app/api/users/[id]/route.ts", "utf8");
  check("tagged-address guard covers every user's email, not only your own", usersRoute.includes("if (!maySelfTag(session) && (await addressCarriesTags(email)))"), true);

  // --- signature images ---
  const { signatureKey, saveSignatureImage, readSignatureImage } = await import("../lib/minutesData");
  check("look-alike addresses get different files", signatureKey("chair.smith@school.co.za") === signatureKey("chair_smith@school-co.za"), false);
  check("same address, any case or spacing, same file", signatureKey(" Chair@School.co.za ") === signatureKey("chair@school.co.za"), true);
  await saveSignatureImage("m1", "chair.smith@school.co.za", Buffer.from("victim"));
  await saveSignatureImage("m1", "chair_smith@school-co.za", Buffer.from("other"));
  check("one signatory cannot replace another's image", String(await readSignatureImage("m1", "chair.smith@school.co.za", [])), "victim");
  const { writeFile } = await import("../lib/controlData");
  await writeFile("minutes/m2/signatures/old_x_za.png", Buffer.from("legacy"));
  check("an image stored before the change still reads", String(await readSignatureImage("m2", "old@x.za", ["old@x.za"])), "legacy");
  await writeFile("minutes/m3/signatures/chair_smith_school_co_za.png", Buffer.from("whose"));
  check("a legacy image two signatories could share is read by neither",
    [await readSignatureImage("m3", "chair.smith@school.co.za", ["chair.smith@school.co.za", "chair_smith@school-co.za"]),
     await readSignatureImage("m3", "chair_smith@school-co.za", ["chair.smith@school.co.za", "chair_smith@school-co.za"])], [null, null]);

  // --- PDF page count on a crafted file ---
  process.env.ANTHROPIC_API_KEY ||= "unused";
  const { pdfPages } = await import("../lib/contentTranslation");
  const crafted = Buffer.from("/Type/Pages ".repeat(100_000) + "<< /Type /Pages /Kids [] /Count 7 >>", "latin1");
  const t0pdf = Date.now();
  const n = await pdfPages(crafted);
  check("a crafted PDF is counted quickly", Date.now() - t0pdf < 2000, true);
  check("and the real /Count is still found", n, 7);
  const kids = (k: number) => Array.from({ length: k }, (_, i) => `${i + 10} 0 R`).join(" ");
  const flat = `1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj 2 0 obj << /Type /Pages /Kids [${kids(100)}] /Count 100 >> endobj ` +
    Array.from({ length: 100 }, (_, i) => `${i + 10} 0 obj << /Type /Page /Parent 2 0 R >> endobj`).join(" ");
  check("a flat 100-page PDF", await pdfPages(Buffer.from(flat, "latin1")), 100);
  const nested = `2 0 obj << /Type /Pages /Kids [${kids(5)}] /Count 500 >> endobj ` +
    Array.from({ length: 5 }, (_, i) => `${i + 10} 0 obj << /Type /Pages /Parent 2 0 R /Kids [${kids(100)}] /Count 100 >> endobj`).join(" ");
  check("a nested 500-page PDF", await pdfPages(Buffer.from(nested, "latin1")), 500);
  const padded = `2 0 obj << /Type /Pages /Kids [${kids(500)}]${" ".repeat(5000)}/Count 500 >> endobj 9 0 obj << /Type /Pages /Count 1 >> endobj`;
  check("padding and a decoy /Count 1 cannot make it pay less", await pdfPages(Buffer.from(padded, "latin1")), 500);
  let askedApi = false;
  await pdfPages(Buffer.from("2 0 obj << /Type /Pages /Count 1 >> endobj 3 0 obj << /Type /ObjStm /N 9 >> endobj", "latin1")).catch(() => (askedApi = true));
  check("an object stream that cannot be read: the AI count is asked as well", askedApi, true);
  const { deflateSync } = await import("zlib");
  const packed = "<< /Type /Pages /Kids [10 0 R] /Count 250 >> << /Type /Pages /Parent 2 0 R /Count 250 >>";
  const header = `2 0 11 ${packed.indexOf("<< /Type /Pages /Parent")} `;
  const body = deflateSync(Buffer.from(header + packed, "latin1"));
  const objStm = Buffer.concat([
    Buffer.from(`5 0 obj << /Type /ObjStm /N 2 /First ${header.length} /Filter /FlateDecode /Length ${body.length} >>\nstream\n`, "latin1"),
    body,
    Buffer.from("\nendstream\nendobj 9 0 obj << /Type /Pages /Count 1 >> endobj", "latin1"),
  ]);
  check("a compressed (object stream) page tree is read without the AI, decoy and all", await pdfPages(objStm), 250);

  // --- tag membership and email change ---
  const tagsRoute = fs.readFileSync("app/api/tags/[id]/route.ts", "utf8");
  check("tag members are not for every signed-in user", /requireLogin\(/.test(tagsRoute), false);
  const { addressCarriesTags } = await import("../lib/peopleData");
  await writeJson("people.json", [
    { id: "p1", position: "", userId: null, name: "Treasurer", email: "Treasurer@School.co.za", phone: "", profilePic: "", tagIds: ["tag-fincom"] },
    { id: "p2", position: "", userId: null, name: "Parent", email: "parent@school.co.za", phone: "", profilePic: "", tagIds: [] },
    { id: "p3", position: "", userId: "u5", name: "Linked", email: "linked@school.co.za", phone: "", profilePic: "", tagIds: ["tag-fincom"] },
  ]);
  check("an unlinked tagged entry's address carries tags", await addressCarriesTags(" treasurer@school.co.za"), true);
  check("an untagged entry's does not", await addressCarriesTags("parent@school.co.za"), false);
  check("an entry linked to a login does not", await addressCarriesTags("linked@school.co.za"), false);
  check("creating a user checks it too", fs.readFileSync("app/api/users/route.ts", "utf8").includes("!maySelfTag(session) && (await addressCarriesTags("), true);
  check("confirm-email checks it", fs.readFileSync("app/api/account/confirm-email/route.ts", "utf8").includes("addressCarriesTags("), true);

  // --- restricted-minutes actions: chase emails and the run log ---
  // FINCOM minutes with no distribution list: only minutes admins and the
  // people carrying the action may read them.
  await writeJson("roles.json", [{ id: "secretary", name: "Secretary", permissions: ["manage_people"] }]);
  await writeJson("users.json", [
    { id: "s1", name: "Sec", surname: "R", email: "sec@school.co.za", password: "x", role: "secretary", forcePasswordChange: false, createdAt: "", updatedAt: "" },
  ]);
  await writeJson("minutes/fin1/record.json", { id: "fin1", body: "fincom", title: "FINCOM", reviewers: [], signatories: [] });
  const { resolveActionRecipients } = await import("../lib/actionItemRecipients");
  const action = {
    id: "a1", ref: "A-1", title: "Write off arrears", assigneeIds: ["p1"], assigneeNames: ["Treasurer"],
    raisedById: "s1", raisedByName: "Sec", fromMinutes: { minutesId: "fin1" },
  } as never;
  const got = await resolveActionRecipients(action, ["assignees", "admins"]);
  check("the assignee is still written to", got.resolved.map((r) => r.email), ["Treasurer@School.co.za"]);
  check("an admin who may not read the minutes is not", got.missing.some((m) => m.includes("may not read")), true);
  const notFromMinutes = await resolveActionRecipients({ ...(action as object), fromMinutes: undefined } as never, ["admins"]);
  check("an action not from minutes still reaches admins", notFromMinutes.resolved.map((r) => r.email), ["sec@school.co.za"]);
  // A minutes read that FAILS is not "deleted": the email is aborted (the
  // cron hands the day back), and the register hides the action.
  await writeFile("minutes/broken/record.json", Buffer.from("{ not json"));
  const fromBroken = { ...(action as object), fromMinutes: { minutesId: "broken" } } as never;
  let aborted = false;
  await resolveActionRecipients(fromBroken, ["assignees", "admins"]).catch(() => (aborted = true));
  check("a failed minutes read aborts the chase instead of mailing admins", aborted, true);
  check("the assignment mail (assignees only) needs no minutes read", (await resolveActionRecipients(fromBroken, ["assignees"])).resolved.length, 1);
  const { actionVisible, loadMinutesAccessContext, readerForUser } = await import("../lib/minutesAccess");
  const actx = await loadMinutesAccessContext();
  const outsider = readerForUser({ id: "zz", email: "zz@school.co.za", tagIds: [] }, [], actx);
  check("an unreadable set hides its action", actionVisible({ fromMinutes: { minutesId: "broken" }, assigneeIds: [] }, outsider, new Map([["broken", null]]), actx), false);
  const { minutesIndex } = await import("../lib/minutesAccess");
  console.error = () => {};
  const index = await minutesIndex();
  console.error = quiet;
  check("the weekly/summary index keeps an unreadable set as null", [index.has("broken"), index.get("broken")], [true, null]);
  check("...so its action is hidden from the weekly update and summary", actionVisible({ fromMinutes: { minutesId: "broken" }, assigneeIds: [] }, outsider, index, actx), false);
  check("weekly update and action summary both use that index", ["lib/weeklyUpdateData.ts", "lib/actionSummaryData.ts"].map((f) => fs.readFileSync(f, "utf8").includes("minutesIndex()")), [true, true]);
  check("a deleted set still shows it", actionVisible({ fromMinutes: { minutesId: "gone" }, assigneeIds: [] }, outsider, new Map(), actx), true);
  const { loadActionRecipientContext } = await import("../lib/actionItemRecipients");
  const sharedCtx = await loadActionRecipientContext();
  check("one context serves many actions", (await resolveActionRecipients(action, ["assignees", "admins"], sharedCtx)).resolved.length, got.resolved.length);
  check("...and caches each minutes record for the run", sharedCtx.minutes.has("fin1"), true);
  const assigneeOnly = await loadActionRecipientContext(false);
  check("the assignee-only path does not load minutes access", assigneeOnly.access, undefined);
  const remind = fs.readFileSync("app/api/action-items/[id]/remind/route.ts", "utf8");
  check("Remind now: a failed chase is recorded and answered with 503", remind.includes("lastReminderResult: `failed:") && remind.includes("status: 503"), true);
  const cron = fs.readFileSync("app/api/cron/reminders/route.ts", "utf8");
  check("the cron loads recipients once per run", cron.includes("loadActionRecipientContext()") && cron.includes("recipientCtx)"), true);
  check("the run log names meeting actions by reference only", /Action \$\{item\.ref\} \$\{item\.title\}/.test(cron), false);
  const runsRoute = fs.readFileSync("app/api/reminders/runs/route.ts", "utf8");
  check("old run logs are cut per reader, by reference alone", runsRoute.includes("visibleActionsFor(") && !runsRoute.includes("i.title"), true);

  // --- counters: two identical writes must never count as one ---
  const { addCredits, getCredits } = await import("../lib/contentTranslation");
  await writeJson("settings/translation-credits.json", { balance: 0 });
  console.error = () => {};
  const adds = await Promise.allSettled(Array.from({ length: 10 }, () => addCredits(1)));
  console.error = quiet;
  check("10 top-ups at once: every one that reported success is counted",
    await getCredits(), adds.filter((r) => r.status === "fulfilled").length);
  const { touch } = await import("../lib/roomBookingData");
  const row = { id: "b1", updatedAt: "2026-10-21T05:00:00.000Z" } as never;
  check("two identical booking writes still differ (rev)", JSON.stringify(touch(row)) === JSON.stringify(touch(row)), false);
  const marked = ["lib/actionItemData.ts", "lib/creditRequests.ts", "lib/weeklyUpdateData.ts", "lib/actionSummaryData.ts", "lib/spendData.ts"];
  check("every claim / counter file writes a random rev", marked.filter((f) => !/rev: (crypto\.randomUUID\(\)|randomBytes)/.test(fs.readFileSync(f, "utf8"))), []);
  check("the translation in-flight claim too", fs.readFileSync("lib/contentTranslation.ts", "utf8").includes("return { at: Date.now(), rev: randomUUID() }"), true);
  const signin = fs.readFileSync("lib/signinLog.ts", "utf8");
  const credits = fs.readFileSync("lib/contentTranslation.ts", "utf8");
  check("credits and sign-in tallies carry a random rev per write", [(credits.match(/rev: randomUUID\(\)/g) || []).length, signin.includes("s.rev = randomUUID()")], [3, true]);

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
