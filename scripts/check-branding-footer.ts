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

  // --- bad input: control characters, lone surrogates, lines, non-strings
  const { cleanWordFooter, docxText, wordFooterLineCount } = await import("../lib/branding");
  const bad = /[\u0000-\u0009\u000B-\u001F]|[\uD800-\uDFFF]/;
  check("control chars stripped", cleanWordFooter("A\vB\u0001C\fD\u0000E\tF"), "ABCDE F");
  check("tabs become spaces", cleanWordFooter("Reg\t1\t\t2"), "Reg 1  2");
  check("lone surrogates at the edges and back to back", cleanWordFooter("\uDC00😀\uD800\uD800😀\uDC00\uDC00"), "😀😀");
  const fs = await import("fs");
  check("no regex lookbehind in lib/branding.ts (old Safari)", /\(\?<[=!]/.test(fs.readFileSync("lib/branding.ts", "utf8")), false);
  check("lone surrogates stripped, real emoji kept", cleanWordFooter("x\uD800y\uDC00z 😀"), "xyz 😀");
  check("CR, CRLF and LF all split", cleanWordFooter("a\rb\r\nc\nd"), "a\nb\nc\nd");
  check("blank runs collapse, ends dropped", cleanWordFooter("\n \nA\n\n \n\nB\n\n"), "A\n\nB");
  check("lines are counted after cleaning", [wordFooterLineCount(""), wordFooterLineCount("1\n\n\n2\n"), wordFooterLineCount("1\n2\n3\n4\n5\n6\n7")], [0, 3, 7]);
  check("docxText keeps tab/LF/CR, drops the rest", docxText("a\tb\nc\rd\u0001\u000B￾￿\uD800e😀"), "a\tb\nc\rde😀");
  const cut = cleanWordFooter("x".repeat(498) + " 😀😀");
  check("cut by code point, never half an emoji", [Array.from(cut).length, cut.endsWith(" 😀")], [500, true]);
  check("cut then trimmed, no trailing newline", cleanWordFooter("x".repeat(499) + "\ny"), "x".repeat(499));

  await put(admin, { wordFooter: "Dir\vA\u0001B\nReg 1" });
  check("route strips control chars on save", (await getStoredBranding()).wordFooter, "DirAB\nReg 1");
  // An older, uncleaned footer straight in the store: the docx cleans it too.
  await saveStoredBranding({ ...(await getStoredBranding()), wordFooter: "Old\vX\u0001Y\uD800" });
  const dirty = await footerXml();
  check("docx footer has no control chars or lone surrogates", [dirty.includes("OldXY"), bad.test(dirty.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ""))], [true, false]);

  // Every other text field in the docx is cleaned too: name, title, bodies.
  await saveStoredBranding({ ...(await getStoredBranding()), fullName: "Sch\u0001ool\uFFFF" });
  const dirtyRecord = { ...record, title: "Ti\vtle\uD800", sections: [{ id: "a", title: "Op\u0002en", body: "Bo\u0000dy\u001F", order: 1 }] } as typeof record;
  const zip = await JSZip.loadAsync(await buildMinutesDocxFile(dirtyRecord));
  const allXml = (await Promise.all(Object.keys(zip.files).filter((n) => n.endsWith(".xml")).map((n) => zip.file(n)!.async("string")))).join("");
  check("no bad chars anywhere in the docx", [allXml.includes("School"), allXml.includes("Title"), allXml.includes("Body"), /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/.test(allXml), bad.test(allXml.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "").replace(/[\t\n\r]/g, ""))], [true, true, true, false, false]);
  await saveStoredBranding({ ...(await getStoredBranding()), fullName: "Test School" });

  const before = (await getStoredBranding()).wordFooter;
  check("non-string footer refused", (await put(admin, { wordFooter: { x: 1 } })).status, 400);
  check("non-string footer not saved", (await getStoredBranding()).wordFooter, before);
  check("7 lines refused, not cut", (await put(admin, { wordFooter: "1\n2\n3\n4\n5\n6\n7" })).status, 400);
  check("6 lines accepted", (await put(admin, { wordFooter: "1\n2\n3\n4\n5\n6" })).status, 200);
  check("null / object school name refused", [(await put(admin, { fullName: null })).status, (await put(admin, { shortName: { a: 1 } })).status], [400, 400]);
  check("school name not saved as the word null", (await getStoredBranding()).fullName, "Test School");
  check("non-string reply-to refused", (await put(admin, { replyTo: { a: 1 } })).status, 400);
  check("array reply-to refused", (await put(admin, { replyTo: ["a@example.test"] })).status, 400);
  await put(admin, { wordFooter: null, replyTo: null });
  const cleared = await getStoredBranding();
  check("null clears footer and reply-to (not the word null)", [cleared.wordFooter, cleared.replyTo], ["", ""]);

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
