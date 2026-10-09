// Checks sign-in sessions (lib/session.ts) and that the server no longer
// believes a user id the browser sends. No server, no blob, nothing sent.
//
//   npx tsx scripts/check-session.ts
import { NextRequest } from "next/server";

process.env.AUTH_SECRET = "check-session-secret";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`
  );
}

async function main() {
  const {
    createSessionToken,
    verifySessionToken,
    readSessionClaims,
    isSameOriginWrite,
    sessionCookieOptions,
    SESSION_TTL_MS,
    SESSION_COOKIE,
  } = await import("../lib/session");
  const { createResetToken, parseResetToken, verifyResetToken } = await import("../lib/passwordReset");

  const now = Date.parse("2026-10-09T08:00:00Z");
  const alice = { id: "11111111-1111-4111-8111-111111111111", password: "$2a$10$aliceHASH" };
  const admin = { id: "22222222-2222-4222-8222-222222222222", password: "$2a$10$adminHASH" };
  const token = createSessionToken(alice, "hvps", now);

  // --- the genuine article ---
  check("a fresh token verifies", verifySessionToken(token, alice, "hvps", now), true);
  check("claims name the user and school", readSessionClaims(token)?.u === alice.id && readSessionClaims(token)?.t === "hvps", true);
  check("the password hash is not in the cookie", token.includes("aliceHASH") || Buffer.from(token.split(".")[0], "base64url").toString().includes("HASH"), false);

  // --- forgeries ---
  // The attack batch 2 exists for: take your own cookie and claim to be the admin.
  const forgedPayload = Buffer.from(JSON.stringify({ u: admin.id, t: "hvps", e: now + 1000 })).toString("base64url");
  const forged = `${forgedPayload}.${token.split(".")[1]}`;
  check("swapping in another user id fails", verifySessionToken(forged, admin, "hvps", now), false);
  check("a token cannot be checked against someone else", verifySessionToken(token, admin, "hvps", now), false);
  check("a garbled signature fails", verifySessionToken(token.slice(0, -2) + "xx", alice, "hvps", now), false);
  check("a signature of the wrong length fails (no throw)", verifySessionToken(token + "abc", alice, "hvps", now), false);
  check("rubbish is not a token", verifySessionToken("not-a-token", alice, "hvps", now), false);
  check("empty is not a token", readSessionClaims(""), null);
  const otherKey = (() => {
    process.env.AUTH_SECRET = "a-different-secret";
    const t = createSessionToken(alice, "hvps", now);
    process.env.AUTH_SECRET = "check-session-secret";
    return t;
  })();
  check("a token signed with another key fails", verifySessionToken(otherKey, alice, "hvps", now), false);

  // --- what ends a session ---
  check("another school's address refuses it", verifySessionToken(token, alice, "jeppe", now), false);
  check("a password change ends it", verifySessionToken(token, { ...alice, password: "$2a$10$NEWhash" }, "hvps", now), false);
  check("still good a minute before expiry", verifySessionToken(token, alice, "hvps", now + SESSION_TTL_MS - 60_000), true);
  check("dead after expiry", verifySessionToken(token, alice, "hvps", now + SESSION_TTL_MS + 1), false);

  // --- a reset token is not a session, and resets still work ---
  const reset = createResetToken(alice as never);
  check("a reset link is not a session", verifySessionToken(reset, alice, "hvps", now), false);
  check("reset links still verify after the key moved", verifyResetToken(parseResetToken(reset)!, alice as never), "valid");

  // --- cross-site writes ---
  check("GET from anywhere is fine", isSameOriginWrite("GET", "https://evil.example", "hvps.schoolcompliance.co.za"), true);
  check("POST from this site is fine", isSameOriginWrite("POST", "https://hvps.schoolcompliance.co.za", "hvps.schoolcompliance.co.za"), true);
  check("POST from another site is refused", isSameOriginWrite("POST", "https://evil.example", "hvps.schoolcompliance.co.za"), false);
  check("POST from another SCHOOL is refused", isSameOriginWrite("DELETE", "https://jeppe.schoolcompliance.co.za", "hvps.schoolcompliance.co.za"), false);
  check("POST from the sandboxed guide (Origin: null) is refused", isSameOriginWrite("POST", "null", "hvps.schoolcompliance.co.za"), false);
  check("POST with no Origin (server to server) is allowed", isSameOriginWrite("POST", null, "hvps.schoolcompliance.co.za"), true);
  check("host compare ignores case and port-less forms", isSameOriginWrite("PUT", "https://HVPS.schoolcompliance.co.za", "hvps.schoolcompliance.co.za"), true);

  // --- cookie attributes ---
  const live = sessionCookieOptions("hvps.schoolcompliance.co.za");
  check("live cookie is httpOnly, Secure, Lax", [live.httpOnly, live.secure, live.sameSite], [true, true, "lax"]);
  check("localhost cookie is not Secure (http)", sessionCookieOptions("localhost:3000").secure, false);
  check("cookie lasts the session length", live.maxAge, SESSION_TTL_MS / 1000);

  // --- the server ignores x-user-id ---
  // No cookie means no session, decided before any store is read, so this runs
  // without a blob token.
  const { getSessionFromRequest } = await import("../lib/rolesData");
  const headerOnly = new NextRequest("https://hvps.schoolcompliance.co.za/api/users", {
    headers: { "x-user-id": admin.id },
  });
  check("an x-user-id header alone is NOT a session", await getSessionFromRequest(headerOnly), null);
  const crossSite = new NextRequest("https://hvps.schoolcompliance.co.za/api/users", {
    method: "POST",
    headers: { origin: "https://evil.example", host: "hvps.schoolcompliance.co.za", cookie: `${SESSION_COOKIE}=${token}` },
  });
  check("a cross-site write with a real cookie is NOT a session", await getSessionFromRequest(crossSite), null);
  const garbage = new NextRequest("https://hvps.schoolcompliance.co.za/api/users", {
    headers: { cookie: `${SESSION_COOKIE}=garbage` },
  });
  check("a junk cookie is NOT a session", await getSessionFromRequest(garbage), null);

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
