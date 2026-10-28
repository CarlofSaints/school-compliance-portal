// Checks two-step sign-in (lib/mfa.ts) against the FAKE blob store: the RFC
// 6238 test vector, clock drift, a code never working twice, backup codes
// spent once, the half-signed-in token dying with a password change, and a
// set-up never replacing an existing one.
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-mfa.ts

export {};

for (const k of ["BLOB_READ_WRITE_TOKEN", "CONTROL_BLOB_READ_WRITE_TOKEN", "TENANT_SECRET", "MULTI_TENANT"]) {
  delete process.env[k];
}
process.env.NEXT_PUBLIC_SCHOOL ||= "hvps";
process.env.AUTH_SECRET = "test-secret-for-checks";

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
  const M = await import("../lib/mfa");

  // RFC 6238 appendix B, SHA-1 secret, T=59s -> 94287082 (last 6 digits).
  const rfc = M.base32Encode(Buffer.from("12345678901234567890"));
  check("RFC 6238 vector", M.totpAt(rfc, 1), "287082");
  check("base32 round trip", M.base32Decode(rfc).toString(), "12345678901234567890");

  const secret = M.newSecret();
  const now = 1_800_000_000_000;
  const step = Math.floor(now / 30000);
  check("current code matches", M.matchTotp(secret, M.totpAt(secret, step), -1, now), step);
  check("30s slow phone matches", M.matchTotp(secret, M.totpAt(secret, step - 1), -1, now), step - 1);
  check("60s off refused", M.matchTotp(secret, M.totpAt(secret, step - 2), -1, now), null);
  check("used step refused", M.matchTotp(secret, M.totpAt(secret, step), step, now), null);
  check("spaces allowed", M.matchTotp(secret, M.totpAt(secret, step).replace(/(\d{3})/, "$1 "), -1, now), step);
  check("letters refused", M.matchTotp(secret, "12a456", -1, now), null);

  const sealed = M.sealSecret(secret);
  check("seal opens", M.openSecret(sealed), secret);
  check("tampered seal refused", M.openSecret(sealed.slice(0, -2) + "AA"), null);
  process.env.AUTH_SECRET = "a-different-key";
  check("other key cannot open", M.openSecret(sealed), null);
  process.env.AUTH_SECRET = "test-secret-for-checks";

  const user = { id: "u1", password: "$2b$10$hashA" };
  const tok = M.createPendingToken(user, "hvps", sealed, now);
  check("pending token verifies", M.verifyPendingToken(tok, user, "hvps", now)?.s, sealed);
  check("dies with password change", M.verifyPendingToken(tok, { ...user, password: "$2b$10$hashB" }, "hvps", now), null);
  check("other school refused", M.verifyPendingToken(tok, user, "jeppe", now), null);
  check("expires", M.verifyPendingToken(tok, user, "hvps", now + M.PENDING_TTL_MS), null);
  const [p, sig] = tok.split(".");
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), u: "u2" })).toString("base64url");
  check("edited claims refused", M.verifyPendingToken(`${forged}.${sig}`, { ...user, id: "u2" }, "hvps", now), null);

  check("no ':' from the school name in the app label", M.otpauthUri("ABC", "a@b.co", "Jeppe: High").startsWith("otpauth://totp/Jeppe%20%20High%3Aa%40b.co?"), true);
  check("only Super Admin needs it", [M.mfaRequired({ role: "super-admin" }), M.mfaRequired({ role: "sgb-admin" })], [true, false]);

  // Set-up and sign-in against the fake store.
  check("wrong set-up code", await M.enrol("u1", sealed, "000000", now), null);
  const codes = await M.enrol("u1", sealed, M.totpAt(secret, step), now);
  check("set-up gives backup codes", codes?.length, M.BACKUP_CODE_COUNT);
  check("second set-up refused as 'exists', not a wrong code", await M.enrol("u1", M.sealSecret(M.newSecret()), M.totpAt(secret, step + 1), now + 30000), "exists");
  check("set-up code not reusable", (await M.checkCode("u1", M.totpAt(secret, step), now)).result, "wrong");
  check("next code works", (await M.checkCode("u1", M.totpAt(secret, step + 1), now + 30000)).result, "ok");
  check("same code twice refused", (await M.checkCode("u1", M.totpAt(secret, step + 1), now + 30000)).result, "wrong");
  const b = codes![0];
  check("backup code works, lower case", await M.checkCode("u1", b.toLowerCase(), now), { result: "backup", backupLeft: M.BACKUP_CODE_COUNT - 1 });
  check("backup code once only", (await M.checkCode("u1", b, now)).result, "wrong");
  check("no set-up, no sign-in", (await M.checkCode("nobody", M.totpAt(secret, step), now)).result, "wrong");
  await M.deleteMfa("u1");
  check("reset removes it", await M.getMfa("u1"), null);

  console.log(failures ? `\n${failures} FAILED` : "\nall passed");
  process.exit(failures ? 1 : 0);
}

main();
