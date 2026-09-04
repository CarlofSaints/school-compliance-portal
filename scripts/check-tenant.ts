// Proves the tenant naming and sealing rules with no server, no blob, no network.
//
//   npx tsx scripts/check-tenant.ts
//
// These rules decide which school's data a request reaches, so they are worth
// pinning down somewhere that runs in a second.

import {
  normaliseHostname,
  isValidTenantKey,
  isReservedTenantKey,
  checkTenantKey,
  suggestTenantKey,
} from "../lib/tenant";

process.env.TENANT_SECRET = "test-tenant-secret";
// Imported after the env var is set — secretBox reads it lazily, but this makes
// the dependency obvious to anyone editing the file.
import { seal, open } from "../lib/secretBox";

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.error(`  FAIL ${label}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`);
  }
}

console.log("\nHostnames normalise the same way in and out");
{
  check("plain", normaliseHostname("hurlyvale.schoolcompliance.co.za"), "hurlyvale.schoolcompliance.co.za");
  check("uppercase", normaliseHostname("Hurlyvale.SchoolCompliance.CO.ZA"), "hurlyvale.schoolcompliance.co.za");
  check("port stripped", normaliseHostname("localhost:3000"), "localhost");
  check("trailing dot stripped", normaliseHostname("a.example.com."), "a.example.com");
  check("padded", normaliseHostname("  a.example.com  "), "a.example.com");
  check("forwarded list takes the first", normaliseHostname("a.example.com, b.example.com"), "a.example.com");
  check("null", normaliseHostname(null), "");
  check("undefined", normaliseHostname(undefined), "");
  check("empty", normaliseHostname(""), "");
}

console.log("\nKeys become blob paths, so they are strict");
{
  check("normal", isValidTenantKey("hurlyvale"), true);
  check("with hyphen", isValidTenantKey("jeppe-girls"), true);
  check("with digits", isValidTenantKey("school2026"), true);
  check("too short", isValidTenantKey("ab"), false);
  check("uppercase refused", isValidTenantKey("Hurlyvale"), false);
  check("leading hyphen refused", isValidTenantKey("-hurlyvale"), false);
  check("trailing hyphen refused", isValidTenantKey("hurlyvale-"), false);
  check("space refused", isValidTenantKey("hurly vale"), false);
  check("dot refused", isValidTenantKey("hurly.vale"), false);
  check("underscore refused", isValidTenantKey("hurly_vale"), false);
  // The ones that matter: anything that could climb out of its own prefix.
  check("slash refused", isValidTenantKey("a/b"), false);
  check("dot dot refused", isValidTenantKey(".."), false);
  check("traversal refused", isValidTenantKey("../other"), false);
  check("encoded traversal refused", isValidTenantKey("%2e%2e"), false);
  check("over 32 refused", isValidTenantKey("a".repeat(33)), false);
}

console.log("\nReserved names cannot be taken by a school");
{
  for (const k of ["www", "api", "admin", "app", "control", "tenants", "hosts", "generic", "static", "_next", "public"]) {
    check(`"${k}" reserved`, isReservedTenantKey(k), true);
  }
  check("a real school is not reserved", isReservedTenantKey("hurlyvale"), false);
  check("checkTenantKey: good", checkTenantKey("hurlyvale"), null);
  check("checkTenantKey: bad shape", checkTenantKey("Hurly Vale"), "invalid");
  check("checkTenantKey: reserved", checkTenantKey("admin"), "reserved");
  // Order matters: "_next" fails the pattern before it is ever seen as reserved.
  check("checkTenantKey: reserved AND badly shaped reads as invalid", checkTenantKey("_next"), "invalid");
}

console.log("\nSuggested keys are usable");
{
  check("simple", suggestTenantKey("Hurlyvale Primary School"), "hurlyvale-primary-school");
  check("punctuation", suggestTenantKey("St. Mary's School"), "st-mary-s-school");
  check("accents", suggestTenantKey("Écolé Française"), "ecole-francaise");
  check("very short name is padded", checkTenantKey(suggestTenantKey("Ab")), null);
  check("long name still valid", checkTenantKey(suggestTenantKey("The Very Long Name Of A School That Goes On")), null);
  check("suggestion never ends in a hyphen", suggestTenantKey("Trailing --- ").endsWith("-"), false);
}

console.log("\nSealed tenant credentials");
{
  const secret = "vercel_blob_rw_EXAMPLETOKENVALUE123456";
  const sealed = seal(secret);
  check("round trips", open(sealed), secret);
  check("ciphertext does not contain the plaintext", sealed.includes(secret), false);
  check("is versioned", sealed.startsWith("v1."), true);

  // Two seals of the same value must differ, or an observer learns that two
  // schools share a token.
  check("nonce makes each seal unique", seal(secret) === seal(secret), false);

  let tampered = false;
  try {
    const parts = sealed.split(".");
    // Flip a character in the ciphertext.
    const body = parts[3];
    parts[3] = (body[0] === "A" ? "B" : "A") + body.slice(1);
    open(parts.join("."));
  } catch {
    tampered = true;
  }
  check("tampering throws rather than decrypting to something else", tampered, true);

  let wrongKey = false;
  const realSecret = process.env.TENANT_SECRET;
  process.env.TENANT_SECRET = "a-different-master-key";
  try {
    open(sealed);
  } catch {
    wrongKey = true;
  }
  process.env.TENANT_SECRET = realSecret;
  check("a different master key cannot open it", wrongKey, true);

  let noKey = false;
  delete process.env.TENANT_SECRET;
  try {
    seal("anything");
  } catch {
    noKey = true;
  }
  process.env.TENANT_SECRET = realSecret;
  check("no master key fails loudly rather than using a default", noKey, true);

  for (const bad of ["", "v1", "v1.a.b", "v2.a.b.c", "not-sealed", "...."]) {
    let threw = false;
    try {
      open(bad);
    } catch {
      threw = true;
    }
    check(`malformed ${JSON.stringify(bad)} throws`, threw, true);
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
