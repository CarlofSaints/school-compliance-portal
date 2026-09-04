// Proves the reset-token rules with no server, no blob and no email.
//
//   npx tsx scripts/check-password-reset.ts
//
// The token is signed with the user's current password hash, so most of what
// matters here is what happens AFTER the password moves.

import {
  createResetToken,
  parseResetToken,
  verifyResetToken,
  RESET_TTL_MS,
} from "../lib/passwordReset";
import type { User } from "../lib/userData";

process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-for-checks";

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else {
    fail++;
    console.error(`  FAIL ${label}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`);
    return;
  }
  console.log(`  ok   ${label}`);
}

function user(overrides: Partial<User> = {}): User {
  return {
    id: "a7470f02-6128-4967-9368-301388636aaf",
    name: "Dee",
    surname: "Schoultz",
    email: "dschoultz@example.test",
    password: "$2b$10$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ0123456",
    role: "sgb-admin",
    forcePasswordChange: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function verify(token: string, u: User) {
  const parsed = parseResetToken(token);
  if (!parsed) return "unparseable";
  return verifyResetToken(parsed, u);
}

console.log("\nHappy path");
{
  const u = user();
  const t = createResetToken(u);
  check("a fresh token verifies", verify(t, u), "valid");
  check("it carries the user id", parseResetToken(t)?.userId, u.id);
  const expiry = parseResetToken(t)!.expiry;
  check(
    "it expires about an hour out",
    Math.abs(expiry - (Date.now() + RESET_TTL_MS)) < 5000,
    true
  );
}

console.log("\nSingle use — the password hash is part of the signature");
{
  const u = user();
  const t = createResetToken(u);
  check("valid before the reset", verify(t, u), "valid");
  const after = user({ password: "$2b$10$SOMETHINGCOMPLETELYDIFFERENT00000000000000000000000000" });
  check("dead the moment the password changes", verify(t, after), "invalid");
}
{
  // The realistic replay: two links in the inbox, the older one must not work
  // once the newer one has been used.
  const u = user();
  const first = createResetToken(u);
  const second = createResetToken(u);
  check("both links verify while the password stands", [verify(first, u), verify(second, u)], ["valid", "valid"]);
  const after = user({ password: "$2b$10$NEWHASHNEWHASHNEWHASHNEWHASHNEWHASHNEWHASHNEWHASHNEWHA" });
  check("using one kills the other too", [verify(first, after), verify(second, after)], ["invalid", "invalid"]);
}

console.log("\nExpiry");
{
  const u = user();
  const t = createResetToken(u);
  const parsed = parseResetToken(t)!;
  // Rewind the clock rather than forging the token, so the signature stays real.
  const realNow = Date.now;
  Date.now = () => realNow() + RESET_TTL_MS + 1000;
  check("an hour later it is expired, not invalid", verifyResetToken(parsed, u), "expired");
  Date.now = realNow;
  check("and valid again once the clock is put back", verifyResetToken(parsed, u), "valid");
}

console.log("\nTampering");
{
  const u = user();
  const t = createResetToken(u);
  const [id, expiry, sig] = t.split(".");

  check(
    "pushing the expiry out is rejected",
    verify(`${id}.${Number(expiry) + 86400000}.${sig}`, u),
    "invalid"
  );
  check(
    "swapping in another user id is rejected",
    verify(`${Buffer.from("someone-else").toString("base64url")}.${expiry}.${sig}`, u),
    "invalid"
  );
  check("a mangled signature is rejected", verify(`${id}.${expiry}.${sig.slice(0, -2)}xx`, u), "invalid");
  check("an empty signature is rejected", verify(`${id}.${expiry}.`, u), "unparseable");
  check(
    "a signature of the wrong length is rejected, not a crash",
    verify(`${id}.${expiry}.short`, u),
    "invalid"
  );
}

console.log("\nMalformed input never throws");
{
  const u = user();
  for (const bad of ["", ".", "..", "a.b", "a.b.c.d", "not-a-token", "a.notanumber.c", "a.0.c", "a.-1.c", "a.NaN.c"]) {
    const got = verify(bad, u);
    check(`${JSON.stringify(bad)} is refused`, got === "valid", false);
  }
}

console.log("\nA different signing key cannot verify");
{
  const u = user();
  const t = createResetToken(u);
  process.env.AUTH_SECRET = "a-completely-different-secret";
  check("rotating the secret invalidates outstanding links", verify(t, u), "invalid");
  process.env.AUTH_SECRET = "test-secret-for-checks";
  check("and the original secret still works", verify(t, u), "valid");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
