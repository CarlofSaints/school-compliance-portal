// Checks the rate limiter (lib/rateLimit.ts): the counting, the 429 it sends,
// that it fails OPEN when storage is unreachable, and that every route meant
// to be limited still calls it. No server, no blob.
//
//   npx tsx scripts/check-rate-limit.ts
import fs from "fs";

export {};

delete process.env.BLOB_READ_WRITE_TOKEN;

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`);
}

async function main() {
  const { LIMITS, nextBucket, tooMany, enforce } = await import("../lib/rateLimit");
  const L = LIMITS.loginAccount; // 5 per 15 minutes
  const t0 = Date.parse("2026-10-10T08:00:00Z");

  // --- counting ---
  let b = nextBucket(L, null, t0);
  check("first hit starts a window at 1", b, { start: t0, count: 1 });
  for (let i = 0; i < 5; i++) b = nextBucket(L, b, t0 + 1000 * i);
  check("six hits in the window count six", b.count, 6);
  check("the window keeps its start", b.start, t0);
  const later = nextBucket(L, b, t0 + 15 * 60 * 1000);
  check("after the window a new one starts at 1", later, { start: t0 + 15 * 60 * 1000, count: 1 });

  // --- the 429 ---
  const res = tooMany(L, { ok: false, remaining: 0, retryAfter: 600 });
  const body = await res.json();
  check("status is 429", res.status, 429);
  check("Retry-After header is the seconds to wait", res.headers.get("Retry-After"), "600");
  check("the message says how long", body.error, "Too many wrong passwords for this account. Try again in 10 minutes, or reset your password.");
  check("the body carries the seconds too", body.retryAfterSeconds, 600);
  check("the body names the limit", body.limit, "5 per 15 minutes");
  const short = await tooMany(LIMITS.signupCheckIp, { ok: false, remaining: 0, retryAfter: 42 }).json();
  check("short waits are in seconds", short.error, "Too many checks. Try again in 42 seconds.");

  // --- fails open ---
  const errors = console.error;
  console.error = () => {};
  const verdict = await enforce([[L, "someone@example.com"]]);
  console.error = errors;
  check("with storage unreachable the request is allowed, not locked out", verdict, null);

  // --- every limited route still calls the limiter ---
  const mustLimit: [string, string][] = [
    ["app/api/auth/route.ts", "LIMITS.loginIp"],
    ["app/api/auth/route.ts", "LIMITS.loginAccount"],
    ["app/api/auth/forgot-password/route.ts", "LIMITS.resetRequestEmail"],
    ["app/api/auth/reset-password/route.ts", "LIMITS.resetCompleteIp"],
    ["app/api/account/route.ts", "LIMITS.emailChangeUser"],
    ["app/api/account/confirm-email/route.ts", "LIMITS.confirmEmailIp"],
    ["app/api/schools/route.ts", "LIMITS.signupIp"],
    ["app/api/schools/route.ts", "LIMITS.signupCheckIp"],
    ["app/api/compliance/check/route.ts", "LIMITS.aiUser"],
    ["app/api/policies/[id]/check/route.ts", "LIMITS.aiUser"],
    ["app/api/documents/[id]/check/route.ts", "LIMITS.aiUser"],
    ["app/api/action-items/[id]/remind/route.ts", "LIMITS.emailSendUser"],
    ["app/api/action-items/bulk/route.ts", "LIMITS.emailSendUser"],
    ["app/api/action-items/import/route.ts", "LIMITS.emailSendUser"],
    ["app/api/action-items/route.ts", "LIMITS.emailSendUser"],
    ["app/api/action-summary/route.ts", "LIMITS.emailSendUser"],
    ["app/api/minutes/[id]/distribute/route.ts", "LIMITS.emailSendUser"],
    ["app/api/minutes/[id]/open-signing/route.ts", "LIMITS.emailSendUser"],
    ["app/api/minutes/[id]/send-for-review/route.ts", "LIMITS.emailSendUser"],
    ["app/api/spend/[id]/remind/route.ts", "LIMITS.emailSendUser"],
    ["app/api/spend/route.ts", "LIMITS.emailSendUser"],
    ["app/api/users/[id]/notify/route.ts", "LIMITS.emailSendUser"],
    ["app/api/users/route.ts", "LIMITS.emailSendUser"],
    ["app/api/weekly-update/route.ts", "LIMITS.emailSendUser"],
  ];
  const missing = mustLimit.filter(([f, l]) => !fs.readFileSync(f, "utf8").includes(l)).map(([f, l]) => `${f} ${l}`);
  check(`all ${mustLimit.length} limited routes still call their limit`, missing, []);

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
