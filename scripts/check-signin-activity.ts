// Sign-in tracking: every sign-in, failed sign-in, block, sign-out and
// password change lands in the activity log, and the per-user tally at
// signins/users/<userId>.json counts them right.
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
  const { readSignInStats, buildSignInRows, deviceOf, sastDay, countSignIn, trackingSince } = await import("../lib/signinLog");
  const { LIMITS } = await import("../lib/rateLimit");
  const auth = await import("../app/api/auth/route");
  const changePw = await import("../app/api/auth/change-password/route");
  const signins = await import("../app/api/activity/signins/route");
  const usersRoute = await import("../app/api/users/route");
  const { flushAfterResponse } = await import("../lib/activityActor");
  const { key: tenantKey } = await tenantScope();

  // A role that may read the users list but NOT the activity log.
  await saveRoles([...DEFAULT_ROLES, { id: "users-viewer", name: "Users viewer", permissions: ["view_users"] }]);
  const mk = (id: string, role: string, force = false) =>
    createUser({ id, name: id, surname: "Tester", email: `${id}@example.test`, password: "pw-" + id + "-SECRET", role, forcePasswordChange: force, tagIds: [] });
  const admin = await mk("admin", "super-admin");
  const member = await mk("member", "sgb-member");
  await mk("newbie", "viewer", true);

  let ipSeq = 1;
  function req(method: string, path: string, opts: { json?: unknown; ip?: string; fwd?: string; as?: { id: string; password: string } } = {}) {
    const ip = opts.ip || `10.0.0.${ipSeq}`;
    const headers: Record<string, string> = {
      host: HOST,
      origin: `http://${HOST}`,
      "user-agent": UA,
      "x-real-ip": ip,
      "x-forwarded-for": opts.fwd || ip,
    };
    if (opts.as) headers.cookie = `${SESSION_COOKIE}=${createSessionToken(opts.as, tenantKey)}`;
    if (opts.json !== undefined) headers["content-type"] = "application/json";
    return new NextRequest(`http://${HOST}${path}`, { method, headers, body: opts.json === undefined ? undefined : JSON.stringify(opts.json) });
  }
  // The logging runs after the response (after()); outside Next it is queued,
  // and the check waits for it before looking.
  let lastQueued = 0;
  const signIn = async (email: string, password: string, ip?: string, fwd?: string) => {
    const r = await auth.POST(req("POST", "/api/auth", { json: { email, password }, ip, fwd }));
    lastQueued = await flushAfterResponse();
    return r;
  };
  const signOut = async (as: { id: string; password: string }) => {
    const r = await auth.DELETE(req("DELETE", "/api/auth", { as }));
    await flushAfterResponse();
    return r;
  };
  const authEntries = async () => (await readActivity({ entity: "auth", limit: 10000 })).entries;
  const total = (days: Record<string, number> = {}) => Object.values(days).reduce((a, n) => a + n, 0);

  console.log("deviceOf");
  check(deviceOf(UA) === "Chrome on Windows", `Chrome UA -> "${deviceOf(UA)}"`);
  check(deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1") === "Safari on iPhone", "Safari on iPhone");
  check(deviceOf("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/141.0 Safari/537.36 Edg/141.0") === "Edge on Windows", "Edge on Windows");
  check(deviceOf(null) === "Unknown device", "no UA -> Unknown device");

  console.log("\nSAST days and windows");
  check(sastDay(Date.parse("2026-10-18T22:30:00Z")) === "2026-10-19", "22:30 UTC is the NEXT day in SAST");
  check(sastDay(Date.parse("2026-10-18T21:59:00Z")) === "2026-10-18", "21:59 UTC is still the same SAST day");
  const one = { x: { name: "X", email: "x@t", days: { "2026-10-12": 1 }, failedDays: {} } };
  check(buildSignInRows([], one, null, Date.parse("2026-10-18T21:00:00Z"))[0].last7 === 1, "12 Oct is inside the 7 days ending SAST 18 Oct");
  check(buildSignInRows([], one, null, Date.parse("2026-10-18T22:30:00Z"))[0].last7 === 0, "12 Oct is outside the 7 days ending SAST 19 Oct");
  // 11:00+02:00 is 09:00Z, BEFORE a 10:00Z start, though it sorts after it as text.
  const tz = buildSignInRows([{ id: "tz", name: "T", surname: "Z", email: "tz@t", createdAt: "2026-10-18T11:00:00+02:00" }], {}, "2026-10-18T10:00:00.000Z");
  check(tz[0].never === false && tz[0].noneSinceTracking === true, "createdAt vs tracking date compared as instants, not text");

  console.log("\nGood sign-in");
  check((await trackingSince()) === null, "no tracking date before the first sign-in");
  let res = await signIn(member.email, "pw-member-SECRET");
  check(res.status === 200, `HTTP ${res.status}`);
  check(lastQueued >= 1, `the sign-in log write ran after the response (${lastQueued} queued)`);
  let entries = await authEntries();
  const ok = entries.filter((e) => e.action === "auth.sign_in");
  check(ok.length === 1 && ok[0].actorId === "member" && ok[0].ip === "10.0.0.1" && ok[0].detail?.device === "Chrome on Windows", "one auth.sign_in entry with actor, ip and device", JSON.stringify(ok));
  let st = await readSignInStats();
  check(total(st.member?.days) === 1 && st.member?.lastIp === "10.0.0.1" && st.member?.lastDevice === "Chrome on Windows" && !!st.member?.lastAt, "per-user tally: 1 sign-in + last ip/device", JSON.stringify(st.member));
  const keys = [...store.keys()];
  check(keys.some((k) => k.endsWith("signins/users/member.json")), "stored at signins/users/<userId>.json");
  check(!keys.some((k) => /signins\/\d{4}-\d{2}\.json$/.test(k)), "no school-wide monthly tally file");
  const since = await trackingSince();
  check(!!since, `tracking date written on the first sign-in (${since})`);

  console.log("\nIP is the same source as other activity entries (x-forwarded-for first)");
  await signIn(member.email, "pw-member-SECRET", "10.0.0.50", "203.0.113.7");
  entries = await authEntries();
  check(entries.some((e) => e.action === "auth.sign_in" && e.ip === "203.0.113.7"), "entry ip is the forwarded client address");

  console.log("\nWrong password");
  ipSeq = 2;
  res = await signIn(member.email, "wrong-guess-SECRET");
  check(res.status === 401, `HTTP ${res.status}`);
  check(lastQueued >= 1, "wrong-password logging ran after the response");
  entries = await authEntries();
  check(entries.filter((e) => e.action === "auth.sign_in_failed" && e.actorId === "member").length === 1, "one auth.sign_in_failed naming the user");
  st = await readSignInStats();
  check(total(st.member?.failedDays) === 1 && total(st.member?.days) === 2, "tally: failed 1, sign-ins still 2", JSON.stringify(st.member));

  console.log("\nUnknown email: one entry per connection per window");
  ipSeq = 5;
  const longTyped = "  nobody@example.test" + "x".repeat(300) + "  ";
  res = await signIn(longTyped, "whatever-SECRET");
  check(res.status === 401, `HTTP ${res.status}`);
  check(lastQueued >= 1, "unknown-address logging ran after the response");
  for (let i = 0; i < 4; i++) await signIn(`other${i}@example.test`, "whatever-SECRET");
  entries = await authEntries();
  const unk = entries.filter((e) => e.action === "auth.sign_in_failed" && !e.actorId);
  check(unk.length === 1, `5 unknown-address attempts from one connection -> 1 entry (got ${unk.length})`);
  const typedFirst = String(unk[0]?.detail?.firstTypedEmail || "");
  check(typedFirst.startsWith("nobody@example.test") && typedFirst.length <= 120, "no actorId; first typed address trimmed + capped, in detail", typedFirst);
  check(unk[0]?.actorName === "Unknown address" && !unk[0]?.summary.includes("nobody@"), "Who is the fixed 'Unknown address'; typed text not in actorName or summary", JSON.stringify(unk[0]));
  await signIn("from-elsewhere@example.test", "whatever-SECRET", "10.0.0.6");
  entries = await authEntries();
  check(entries.filter((e) => e.action === "auth.sign_in_failed" && !e.actorId).length === 2, "a second connection gets its own entry");
  st = await readSignInStats();
  check(Object.keys(st).every((k) => ["member", "admin", "newbie"].includes(k)), "unknown addresses NOT tallied");

  console.log("\nSeveral sign-ins");
  ipSeq = 3;
  for (let i = 0; i < 2; i++) await signIn(member.email, "pw-member-SECRET");
  await signIn(admin.email, "pw-admin-SECRET");
  st = await readSignInStats();
  check(total(st.member?.days) === 4 && total(st.admin?.days) === 1, `member 4, admin 1 (got ${total(st.member?.days)}, ${total(st.admin?.days)})`);
  const late = await mk("late", "viewer", true);
  let rows = buildSignInRows([admin, member, (await getUserById("newbie"))!, late], st, since);
  const m = rows.find((r) => r.userId === "member");
  check(m?.last7 === 4 && m?.last30 === 4 && m?.failed30 === 1, "rows: member last7 4, last30 4, failed30 1", JSON.stringify(m));
  const newbie = rows.find((r) => r.userId === "newbie");
  check(newbie?.never === false && newbie?.noneSinceTracking === true, "user created BEFORE tracking: 'no sign-in recorded since', not 'never'");
  check(rows.find((r) => r.userId === "late")?.never === true, "user created AFTER tracking with no sign-in: never signed in");
  check(rows.filter((r) => r.never).length === 1, "only the new user counts towards 'never signed in'");
  rows = buildSignInRows([], { x: { name: "X", email: "x@t", days: { "2000-01-01": 2 }, failedDays: {} } }, since);
  check(rows[0].last7 === 0 && rows[0].last30 === 0 && rows[0].removed && !rows[0].never, "old days outside 7/30 windows; unknown id marked removed");

  console.log("\nOnly the last 31 days are kept");
  await countSignIn({ id: "trim", name: "T", email: "t@t" }, "ok", "1.1.1.1", "x", "2026-08-01T10:00:00.000Z");
  await countSignIn({ id: "trim", name: "T", email: "t@t" }, "ok", "1.1.1.1", "x", "2026-10-18T10:00:00.000Z");
  st = await readSignInStats();
  check(JSON.stringify(st.trim?.days) === JSON.stringify({ "2026-10-18": 1 }), "a day older than 31 days is dropped", JSON.stringify(st.trim?.days));

  console.log("\nAccount lock (5 wrong passwords) logs once");
  ipSeq = 4;
  for (let i = 0; i < 7; i++) await signIn(admin.email, "nope-SECRET-" + i);
  entries = await authEntries();
  const locks = entries.filter((e) => e.action === "auth.sign_in_blocked" && e.detail?.reason === "account_locked");
  check(locks.length === 1, `one account_locked entry (got ${locks.length})`);
  const lockedUntil = String(locks[0]?.detail?.lockedUntil || "");
  const hhmm = new Date(Date.parse(lockedUntil) + 2 * 3600000).toISOString().slice(11, 16);
  check(/^Account locked until \d\d:\d\d SAST after 5 wrong passwords$/.test(locks[0]?.summary || "") && locks[0]?.summary.includes(hhmm), "lock entry gives the real reset time in SAST", locks[0]?.summary);
  check(entries.filter((e) => e.action === "auth.sign_in_failed" && e.actorId === "admin").length === 5, "each of the 5 known-user wrong passwords is logged");

  console.log("\nIP limit: blocked attempts log at most once per window");
  const flood = "10.9.9.9";
  const statuses: number[] = [];
  for (let i = 0; i < LIMITS.loginIp.max + 6; i++) statuses.push((await signIn(`bot${i}@example.test`, "x-SECRET", flood)).status);
  check(statuses.filter((s) => s === 429).length === 6, `6 refused with 429 (got ${statuses.filter((s) => s === 429).length})`);
  entries = await authEntries();
  const ipBlocks = entries.filter((e) => e.action === "auth.sign_in_blocked" && e.ip === flood);
  check(ipBlocks.length === 1, "one auth.sign_in_blocked for the IP");
  check(ipBlocks[0]?.actorName === "Unknown connection" && !ipBlocks[0]?.summary.includes("bot"), "blocked entry's Who is fixed, typed text only in detail", JSON.stringify(ipBlocks[0]));
  check(entries.filter((e) => e.action === "auth.sign_in_failed" && e.ip === flood).length === 1, "the flood's 20 unknown addresses -> 1 failed entry");

  console.log("\nSign-out");
  const outs = async () => (await authEntries()).filter((e) => e.action === "auth.sign_out").length;
  const before = await outs();
  const t0 = Date.now();
  res = await signOut({ id: "member", password: "not-the-real-hash" });
  const ms = Date.now() - t0;
  check(res.status === 200 && /sc_session=;/.test(res.headers.get("set-cookie") || ""), "forged cookie: still signed out (cookie cleared)", res.headers.get("set-cookie") || "");
  check(ms < 500, `forged cookie: no retry delay (${ms} ms)`);
  check((await outs()) === before, "forged cookie: nothing logged");
  res = await signOut(member);
  check(res.status === 200 && (await outs()) === before + 1, "real sign-out logged once");
  check((await authEntries()).some((e) => e.action === "auth.sign_out" && e.actorId === "member"), "auth.sign_out names the user");

  console.log("\nPassword change");
  res = await changePw.POST(req("POST", "/api/auth/change-password", { as: member, json: { currentPassword: "pw-member-SECRET", newPassword: "new-pw-SECRET-2" } }));
  check(res.status === 200, `change-password HTTP ${res.status}`);
  check((await authEntries()).some((e) => e.action === "auth.password_changed" && e.actorId === "member"), "auth.password_changed logged");

  console.log("\nAPIs");
  // The password change re-keyed member's session, so sign the cookie with the new hash.
  res = await signins.GET(req("GET", "/api/activity/signins", { as: (await getUserById("member"))! }));
  check(res.status === 403, `sign-ins refused for a member without the activity permission (HTTP ${res.status})`);
  res = await signins.GET(req("GET", "/api/activity/signins", { as: admin }));
  const body = await res.json();
  check(res.status === 200 && body.rows?.length === 5 && body.since === since, `admin gets 4 users + 1 removed, and the tracking date (HTTP ${res.status}, ${body.rows?.length} rows)`);
  const plain = (await (await usersRoute.GET(req("GET", "/api/users", { as: admin }))).json()) as Record<string, unknown>[];
  check(plain.length > 0 && plain.every((u) => !("lastSignInAt" in u)), "/api/users does not read sign-ins by default");
  const withS = (await (await usersRoute.GET(req("GET", "/api/users?withSignIns=1", { as: admin }))).json()) as { id: string; lastSignInAt?: string | null }[];
  check(!!withS.find((u) => u.id === "member")?.lastSignInAt && withS.find((u) => u.id === "late")?.lastSignInAt === null, "/api/users?withSignIns=1 adds lastSignInAt");
  const viewer = await mk("viewer2", "users-viewer");
  res = await usersRoute.GET(req("GET", "/api/users?withSignIns=1", { as: viewer }));
  const vRows = (await res.json()) as Record<string, unknown>[];
  check(res.status === 200 && vRows.every((u) => !("lastSignInAt" in u)), "view_users WITHOUT the activity permission gets no sign-in data, even with ?withSignIns=1");

  console.log("\nmeta.json is only touched on a user's FIRST tally");
  const metaKey = [...store.keys()].find((k) => k.endsWith("signins/meta.json"))!;
  store.delete(metaKey);
  await signIn(admin.email, "pw-admin-SECRET", "10.0.0.70");
  check(!store.has(metaKey), "an existing user's sign-in does not read or write meta.json");
  const fresh = await mk("fresh", "viewer");
  await signIn(fresh.email, "pw-fresh-SECRET", "10.0.0.71");
  check(store.has(metaKey), "a user's first ever tally writes meta.json if it is missing");

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
