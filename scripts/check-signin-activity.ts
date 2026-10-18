// Sign-in tracking: every sign-in, failed sign-in, block, sign-out and
// password change lands in the activity log, and the monthly tally at
// signins/<YYYY-MM>.json counts them right.
//
// Drives the REAL route handlers against the in-memory fake blob store, so it
// can never touch a real school:
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-signin-activity.ts

export {};

for (const k of ["BLOB_READ_WRITE_TOKEN", "CONTROL_BLOB_READ_WRITE_TOKEN", "RESEND_API_KEY", "ANTHROPIC_API_KEY", "TENANT_SECRET", "MULTI_TENANT"]) {
  delete process.env[k];
}
process.env.AUTH_SECRET = "signin-activity-test-secret";
process.env.NEXT_PUBLIC_SCHOOL ||= "hvps";

const HOST = "school.test";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
let failures = 0;
const check = (ok: boolean, label: string, extra = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok || !extra ? "" : "  " + extra}`);
};

async function main() {
  const { createRequire } = await import("module");
  const blob = createRequire(__filename)("@vercel/blob") as { __fakeStore?: () => Map<string, { bytes: Uint8Array }> };
  if (typeof blob.__fakeStore !== "function") {
    console.error("Refusing to run: @vercel/blob is the REAL store. Run with --import ./scripts/fake-blob/register.mjs");
    process.exit(1);
  }
  const store = blob.__fakeStore();

  const { NextRequest } = await import("next/server");
  const { DEFAULT_ROLES } = await import("../lib/roles");
  const { saveRoles } = await import("../lib/rolesData");
  const { createUser, getUserById } = await import("../lib/userData");
  const { createSessionToken, SESSION_COOKIE } = await import("../lib/session");
  const { tenantScope } = await import("../lib/tenantContext");
  const { readActivity } = await import("../lib/activityLog");
  const { readSignInSummaries, buildSignInRows, deviceOf } = await import("../lib/signinLog");
  const { LIMITS } = await import("../lib/rateLimit");
  const auth = await import("../app/api/auth/route");
  const changePw = await import("../app/api/auth/change-password/route");
  const signins = await import("../app/api/activity/signins/route");
  const { key: tenantKey } = await tenantScope();

  await saveRoles(DEFAULT_ROLES);
  const mk = (id: string, role: string, force = false) =>
    createUser({ id, name: id, surname: "Tester", email: `${id}@example.test`, password: "pw-" + id + "-SECRET", role, forcePasswordChange: force, tagIds: [] });
  const admin = await mk("admin", "super-admin");
  const member = await mk("member", "sgb-member");
  await mk("newbie", "viewer", true);

  let ipSeq = 1;
  function req(method: string, path: string, opts: { json?: unknown; ip?: string; as?: { id: string; password: string } } = {}) {
    const headers: Record<string, string> = {
      host: HOST,
      origin: `http://${HOST}`,
      "user-agent": UA,
      "x-real-ip": opts.ip || `10.0.0.${ipSeq}`,
    };
    if (opts.as) headers.cookie = `${SESSION_COOKIE}=${createSessionToken(opts.as, tenantKey)}`;
    if (opts.json !== undefined) headers["content-type"] = "application/json";
    return new NextRequest(`http://${HOST}${path}`, { method, headers, body: opts.json === undefined ? undefined : JSON.stringify(opts.json) });
  }
  const signIn = (email: string, password: string, ip?: string) => auth.POST(req("POST", "/api/auth", { json: { email, password }, ip }));
  const authEntries = async () => (await readActivity({ entity: "auth", limit: 10000 })).entries;
  const summary = async () => (await readSignInSummaries())[0] || {};

  console.log("deviceOf");
  check(deviceOf(UA) === "Chrome on Windows", `Chrome UA -> "${deviceOf(UA)}"`);
  check(deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1") === "Safari on iPhone", "Safari on iPhone");
  check(deviceOf("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/141.0 Safari/537.36 Edg/141.0") === "Edge on Windows", "Edge on Windows");
  check(deviceOf(null) === "Unknown device", "no UA -> Unknown device");

  console.log("\nGood sign-in");
  let res = await signIn(member.email, "pw-member-SECRET");
  check(res.status === 200, `HTTP ${res.status}`);
  let entries = await authEntries();
  const ok = entries.filter((e) => e.action === "auth.sign_in");
  check(ok.length === 1 && ok[0].actorId === "member" && ok[0].ip === "10.0.0.1" && ok[0].detail?.device === "Chrome on Windows", "one auth.sign_in entry with actor, ip and device", JSON.stringify(ok));
  let sum = await summary();
  check(sum.member?.count === 1 && sum.member?.lastIp === "10.0.0.1" && sum.member?.lastDevice === "Chrome on Windows" && !!sum.member?.lastAt, "summary count 1 + last ip/device", JSON.stringify(sum.member));

  console.log("\nWrong password");
  ipSeq = 2;
  res = await signIn(member.email, "wrong-guess-SECRET");
  check(res.status === 401, `HTTP ${res.status}`);
  entries = await authEntries();
  const bad = entries.filter((e) => e.action === "auth.sign_in_failed" && e.actorId === "member");
  check(bad.length === 1, "one auth.sign_in_failed naming the user");
  sum = await summary();
  check(sum.member?.failed === 1 && sum.member?.count === 1, "summary failed 1, count still 1", JSON.stringify(sum.member));

  console.log("\nUnknown email");
  const longTyped = "  nobody@example.test" + "x".repeat(300) + "  ";
  res = await signIn(longTyped, "whatever-SECRET");
  check(res.status === 401, `HTTP ${res.status}`);
  entries = await authEntries();
  const unk = entries.filter((e) => e.action === "auth.sign_in_failed" && !e.actorId);
  check(unk.length === 1 && unk[0].actorName.startsWith("nobody@example.test") && unk[0].actorName.length <= 120 && !unk[0].actorName.startsWith(" "), "logged without actorId, typed address trimmed + capped", JSON.stringify(unk[0]?.actorName));
  sum = await summary();
  check(Object.keys(sum).every((k) => ["member", "admin", "newbie"].includes(k)), "unknown address NOT in the summary");

  console.log("\nSeveral sign-ins");
  ipSeq = 3;
  for (let i = 0; i < 3; i++) await signIn(member.email, "pw-member-SECRET");
  await signIn(admin.email, "pw-admin-SECRET");
  sum = await summary();
  check(sum.member?.count === 4 && sum.admin?.count === 1, `member 4, admin 1 (got ${sum.member?.count}, ${sum.admin?.count})`);
  const rows = buildSignInRows(
    [admin, member, { id: "newbie", name: "newbie", surname: "Tester", email: "newbie@example.test", forcePasswordChange: true }],
    await readSignInSummaries()
  );
  const m = rows.find((r) => r.userId === "member");
  check(m?.last7 === 4 && m?.last30 === 4 && m?.failed30 === 1, "rows: member last7 4, last30 4, failed30 1", JSON.stringify(m));
  check(rows.find((r) => r.userId === "newbie")?.never === true && rows.find((r) => r.userId === "member")?.never === false, "newbie flagged never signed in");
  // A day outside the windows must not count.
  const old = buildSignInRows([], [{ x: { name: "X", email: "x@t", count: 2, failed: 0, days: { "2000-01-01": 2 }, failedDays: {} } }]);
  check(old[0].last7 === 0 && old[0].last30 === 0 && old[0].removed, "old days are outside 7/30 windows; unknown id marked removed");

  console.log("\nAccount lock (5 wrong passwords) logs once");
  ipSeq = 4;
  for (let i = 0; i < 7; i++) await signIn(admin.email, "nope-SECRET-" + i);
  entries = await authEntries();
  const locks = entries.filter((e) => e.action === "auth.sign_in_blocked" && e.detail?.reason === "account_locked");
  check(locks.length === 1, `one account_locked entry (got ${locks.length})`);

  console.log("\nIP limit: blocked attempts log at most once per window");
  const flood = "10.9.9.9";
  const statuses: number[] = [];
  for (let i = 0; i < LIMITS.loginIp.max + 6; i++) statuses.push((await signIn(`bot${i}@example.test`, "x-SECRET", flood)).status);
  check(statuses.filter((s) => s === 429).length === 6, `6 refused with 429 (got ${statuses.filter((s) => s === 429).length})`);
  entries = await authEntries();
  const blocked = entries.filter((e) => e.action === "auth.sign_in_blocked" && e.ip === flood);
  check(blocked.length === 1, `one auth.sign_in_blocked for the IP (got ${blocked.length})`);

  console.log("\nSign-out and password change");
  await auth.DELETE(req("DELETE", "/api/auth", { as: member }));
  res = await changePw.POST(req("POST", "/api/auth/change-password", { as: member, json: { currentPassword: "pw-member-SECRET", newPassword: "new-pw-SECRET-2" } }));
  check(res.status === 200, `change-password HTTP ${res.status}`);
  entries = await authEntries();
  check(entries.some((e) => e.action === "auth.sign_out" && e.actorId === "member"), "auth.sign_out logged");
  check(entries.some((e) => e.action === "auth.password_changed" && e.actorId === "member"), "auth.password_changed logged");

  console.log("\nSign-ins API");
  // The password change re-keyed member's session, so sign the cookie with the new hash.
  res = await signins.GET(req("GET", "/api/activity/signins", { as: (await getUserById("member"))! }));
  check(res.status === 403, `refused for a member without the activity permission (HTTP ${res.status})`);
  res = await signins.GET(req("GET", "/api/activity/signins", { as: admin }));
  const body = await res.json();
  check(res.status === 200 && body.rows?.length === 3, `admin gets 3 rows (HTTP ${res.status})`);

  console.log("\nNo password anywhere in storage");
  const dump = [...store.values()].map((f) => Buffer.from(f.bytes).toString("utf8")).join("\n");
  check(!dump.includes("SECRET"), "no typed password in any stored blob");

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
