// The Word minutes footer a school sets under Branding: saved through the real
// route, capped at 500, kept beside the other branding fields, printed in the
// docx footer with its special characters intact, and absent when empty.
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-branding-footer.ts
import JSZip from "jszip";

process.env.AUTH_SECRET ||= "check-branding-footer-secret";

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

  const { NextRequest } = await import("next/server");
  const { saveRoles } = await import("../lib/rolesData");
  const { DEFAULT_ROLES } = await import("../lib/roles");
  const { createUser } = await import("../lib/userData");
  const { createSessionToken, SESSION_COOKIE } = await import("../lib/session");
  const { tenantScope } = await import("../lib/tenantContext");
  const { saveStoredBranding, getStoredBranding } = await import("../lib/brandingData");
  const { buildMinutesDocxFile } = await import("../lib/minutesDocxFile");
  const route = await import("../app/api/branding/route");

  const { key: tenantKey } = await tenantScope();
  await saveRoles(DEFAULT_ROLES);
  const admin = await createUser({ id: "sam", name: "Sam", surname: "Super", email: "sam@example.test", password: "pw-sam", role: "super-admin", forcePasswordChange: false, tagIds: [] });
  const member = await createUser({ id: "erin", name: "Erin", surname: "Member", email: "erin@example.test", password: "pw-erin", role: "sgb-member", forcePasswordChange: false, tagIds: [] });
  const put = (as: { id: string; password: string }, body: unknown) =>
    route.PUT(new NextRequest("http://school.test/api/branding", {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { cookie: `${SESSION_COOKIE}=${createSessionToken(as, tenantKey)}`, host: "school.test", "content-type": "application/json" },
    }));

  // Something already saved that this form must not drop.
  await saveStoredBranding({ fullName: "Test School", replyTo: "sgb@example.test", logo: { contentType: "image/png", filename: "c.png", version: 3, updatedAt: "x" } });

  check("a member cannot set the footer", (await put(member, { wordFooter: "x" })).status, 403);

  const text = 'Directors: A & B <Pty> "Ltd"\nReg 2026/123456/07';
  check("admin save accepted", (await put(admin, { wordFooter: `  ${text}  ` })).status, 200);
  const saved = await getStoredBranding();
  check("footer trimmed and saved", saved.wordFooter, text);
  check("other branding kept", [saved.fullName, saved.replyTo, saved.logo?.version], ["Test School", "sgb@example.test", 3]);

  await put(admin, { wordFooter: "y".repeat(800) });
  check("footer cut to 500", (await getStoredBranding()).wordFooter?.length, 500);
  await put(admin, { fullName: "Test School" });
  check("a save without the field leaves it alone", (await getStoredBranding()).wordFooter?.length, 500);

  const record = {
    id: "m1", title: "SGB meeting", body: "sgb", period: { kind: "month", year: 2026, month: 5 },
    status: "draft", draftNumber: 1,
    sections: [{ id: "a", title: "Opening", body: "Opened.", order: 1 }],
    signatories: [], reviews: [],
    createdAt: "2026-05-07T00:00:00.000Z", createdBy: "sam@example.test", updatedAt: "2026-05-07T00:00:00.000Z",
  } as unknown as import("../lib/minutesData").MinutesRecord;
  const footerXml = async () => {
    const zip = await JSZip.loadAsync(await buildMinutesDocxFile(record));
    const names = Object.keys(zip.files).filter((n) => /^word\/footer\d*\.xml$/.test(n));
    return (await Promise.all(names.map((n) => zip.file(n)!.async("string")))).join("");
  };

  await put(admin, { wordFooter: text });
  const xml = await footerXml();
  check("footer line 1 in the docx, escaped", xml.includes("Directors: A &amp; B &lt;Pty&gt; &quot;Ltd&quot;"), true);
  check("footer line 2 in the docx", xml.includes("Reg 2026/123456/07"), true);
  check("line break kept", /<w:br\/>\s*<w:t[^>]*>Reg 2026/.test(xml), true);
  check("no raw special chars leak", xml.includes("<Pty>"), false);
  check("page numbers still there", xml.includes("PAGE"), true);

  await put(admin, { wordFooter: "   " });
  check("blank saves as empty", (await getStoredBranding()).wordFooter, "");
  const empty = await footerXml();
  check("no footer text when empty", [empty.includes("Directors"), empty.includes("PAGE")], [false, true]);

  console.log(failures ? `\n${failures} FAILED` : "\nall passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
