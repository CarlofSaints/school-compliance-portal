// Checks the fixes from the 19 Oct 2026 security scan: the minutes signing
// code is keyed and never leaves the server, unsafe storage paths are refused,
// and the school name of a public sign-up cannot carry markup.
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-security-scan-fixes.ts
import crypto from "crypto";

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

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
