// "+ Add to action items" in the minutes editor.
//
// Part 1: what text a click takes, and what the action is called (pure).
// Part 2: the request the page sends, through the REAL action-items route,
// against the in-memory blob fake, so nothing touches a real school:
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-minutes-capture.ts

export {};

for (const k of ["BLOB_READ_WRITE_TOKEN", "CONTROL_BLOB_READ_WRITE_TOKEN", "RESEND_API_KEY", "ANTHROPIC_API_KEY", "TENANT_SECRET", "MULTI_TENANT"]) {
  delete process.env[k];
}
process.env.AUTH_SECRET = "minutes-capture-test-secret";
process.env.NEXT_PUBLIC_SCHOOL ||= "hvps";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`);
}

async function main() {
  const { captureText, quickActionTitle } = await import("../lib/minutesCapture");

  console.log("Part 1: what a click takes");
  const body = "Fence on the east side is broken.\nQuote needed before the next meeting.\n\nTuck shop prices to go up in Term 4.\n\nNo other business.";
  const inSecond = body.indexOf("Tuck") + 5;
  check("cursor in a paragraph takes that whole paragraph", captureText(body, inSecond, inSecond), "Tuck shop prices to go up in Term 4.");
  check("cursor in the first paragraph takes both its lines", captureText(body, 3, 3), "Fence on the east side is broken.\nQuote needed before the next meeting.");
  check("cursor at the very end takes the last paragraph", captureText(body, body.length, body.length), "No other business.");
  const from = body.indexOf("Quote");
  check("a selection takes exactly the selection", captureText(body, from, from + "Quote needed".length), "Quote needed");
  check("an empty box gives nothing", captureText("", 0, 0), "");

  check("the name is the first line", quickActionTitle("Fence on the east side is broken.\nQuote needed."), "Fence on the east side is broken.");
  check("a list marker is dropped", quickActionTitle("3. Get three quotes for the fence"), "Get three quotes for the fence");
  check("a dash marker is dropped", quickActionTitle("- Phone the municipality"), "Phone the municipality");
  check("a number that is part of the name stays", quickActionTitle("2026 budget to FINCOM by March"), "2026 budget to FINCOM by March");
  const long = "The principal will write to every parent whose child has an outstanding fee balance over three months old, offering a payment plan";
  const t = quickActionTitle(long);
  check("a long first line is cut at a word, with ...", [t.length <= 123, t.endsWith("..."), long.startsWith(t.slice(0, -3))], [true, true, true]);

  console.log("\nPart 2: the request the page sends, through the real route");
  const { createRequire } = await import("module");
  const blob = createRequire(__filename)("@vercel/blob") as { __fakeStore?: unknown };
  if (typeof blob.__fakeStore !== "function") {
    console.error("Refusing to run part 2: @vercel/blob is the REAL store. Run with --import ./scripts/fake-blob/register.mjs");
    process.exit(1);
  }
  const { NextRequest } = await import("next/server");
  const { DEFAULT_ROLES } = await import("../lib/roles");
  const { saveRoles } = await import("../lib/rolesData");
  const { createUser } = await import("../lib/userData");
  const { createSessionToken, SESSION_COOKIE } = await import("../lib/session");
  const { tenantScope } = await import("../lib/tenantContext");
  const { createMinutes } = await import("../lib/minutesData");
  const { key } = await tenantScope();

  await saveRoles(DEFAULT_ROLES);
  const admin = await createUser({ id: "sec", name: "Sam", surname: "Secretary", email: "sec@example.test", password: "pw1", role: "sgb-admin", forcePasswordChange: false, tagIds: [] });
  const member = await createUser({ id: "mem", name: "Max", surname: "Member", email: "mem@example.test", password: "pw2", role: "sgb-member", forcePasswordChange: false, tagIds: [] });
  const minutes = await createMinutes({
    title: "SGB meeting",
    body: "sgb",
    period: { kind: "month", year: 2026, month: 10 },
    sections: [{ id: "sec-1", title: "Maintenance", body, order: 1 }],
    createdBy: admin.id,
  } as unknown as Parameters<typeof createMinutes>[0]);

  const HOST = "school.test";
  const post = (as: { id: string; password: string }, json: unknown) =>
    new NextRequest(`http://${HOST}/api/action-items`, {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=${createSessionToken(as, key)}`, host: HOST, origin: `http://${HOST}`, "content-type": "application/json" },
      body: JSON.stringify(json),
    });

  // Exactly what app/(portal)/minutes/[id]/page.tsx captureAction sends.
  const text = captureText(body, inSecond, inSecond);
  const payload = { title: quickActionTitle(text), description: text, fromMinutesId: minutes.id, fromSectionId: "sec-1", notify: false };

  const route = await import("../app/api/action-items/route");
  const res = await route.POST(post(admin, payload));
  const item = await res.json();
  check("the secretary's click creates the action (201)", res.status, 201);
  check("it has a reference to show in the toast", typeof item.ref === "string" && item.ref.length > 0, true);
  check("named from the point", item.title, "Tuck shop prices to go up in Term 4.");
  check("the minuted wording is kept", item.description, text);
  check("linked to the meeting and the item it came from", [item.fromMinutes?.minutesId, item.fromMinutes?.sectionId, item.fromMinutes?.sectionTitle], [minutes.id, "sec-1", "Maintenance"]);
  check("nobody assigned yet, so nobody emailed", [item.assigneeIds, item.notified], [[], 0]);

  const actions = await import("../app/api/minutes/[id]/actions/route");
  const listed = await (
    await actions.GET(
      new NextRequest(`http://${HOST}/api/minutes/${minutes.id}/actions`, { headers: { cookie: `${SESSION_COOKIE}=${createSessionToken(admin, key)}`, host: HOST } }),
      { params: Promise.resolve({ id: minutes.id }) }
    )
  ).json();
  check("it shows under 'Actions from this meeting'", Array.isArray(listed) && listed.some((a: { id: string }) => a.id === item.id), true);

  const refused = await route.POST(post(member, payload));
  check("a member who may not add actions is refused (403)", refused.status, 403);

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
