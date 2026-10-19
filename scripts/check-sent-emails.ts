// The sent box (lib/sentEmails): every email is recorded, secrets blanked,
// personal digests kept without their body, refusals recorded as refusals.
//
//   npx tsx --import ./scripts/fake-blob/register.mjs scripts/check-sent-emails.ts

export {};

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`);
}

async function main() {
  process.env.NEXT_PUBLIC_SCHOOL ||= "hvps";
  process.env.RESEND_API_KEY = "re_check_not_real";
  let refuse = false;
  globalThis.fetch = (async () =>
    refuse
      ? new Response(JSON.stringify({ name: "validation_error", message: "Invalid to address" }), { status: 422, headers: { "content-type": "application/json" } })
      : new Response(JSON.stringify({ id: "x" }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

  const { redactEmailHtml, readSentEmails, readSentEmail } = await import("../lib/sentEmails");
  const email = await import("../lib/email");
  const month = new Date().toISOString().slice(0, 7);

  // --- blanking ---
  check("a reset token in a link is blanked", redactEmailHtml('<a href="https://x/reset-password?token=abc.def">'), '<a href="https://x/reset-password?token=••••••">');
  check("a credits approval link keeps its id, loses its token", redactEmailHtml('href="https://x/credits-approve?id=r1&token=zz9"'), 'href="https://x/credits-approve?id=r1&token=••••••"');
  check("a booking request link is blanked", redactEmailHtml('href="https://x/bookings/request/t0k3n"'), 'href="https://x/bookings/request/••••••"');
  check("a named secret is blanked everywhere", redactEmailHtml("code K7P4QX, again K7P4QX", ["K7P4QX"]), "code ••••••, again ••••••");

  // --- recorded sends ---
  await email.sendMinutesSigningCodeEmail("chair@x.za", "Chair", "m1", "SGB Oct", "October 2026", "K7P4QX");
  await email.sendPasswordResetLinkEmail("p@x.za", "P", "tok-secret-123", 30);
  // An action not raised in minutes: personal, so its body is not kept.
  await email.sendActionAssignedEmail("w@x.za", "W", "Sec", {
    ref: "A-001", title: "Private task", description: "", dueDate: "", daysLeft: null,
    progress: 0, statusLabel: "Not started", assignedTo: "W", priorityLabel: "Normal",
  });
  refuse = true;
  await email.sendWelcomeEmail("bad@x.za", "B", "TempPass99");
  await email.sendWelcomeEmail("amp@x.za", "A", "Tom&Jerry<1>");
  refuse = false;

  const sent = await readSentEmails(month);
  const byTo = (to: string) => sent.find((e) => e.to === to);

  const code = byTo("chair@x.za");
  check("the signing code email is recorded", code?.kind, "minutes.signing_code");
  check("tied to its minutes for the read rule", code?.minutesId, "m1");
  check("🔴 the signing code itself is NOT stored", !!code?.html && !code.html.includes("K7P4QX") && code.html.includes("••••••"), true);
  const reset = byTo("p@x.za");
  check("🔴 the reset token is NOT stored", !!reset?.html && !reset.html.includes("tok-secret-123"), true);
  const weekly = byTo("w@x.za");
  check("a personal email is recorded", weekly?.kind, "action.assigned");
  check("but kept without its body", weekly?.html, undefined);
  const bad = byTo("bad@x.za");
  check("a refused send is recorded as not sent", bad?.ok, false);
  check("with the service's reason", bad?.error, "Invalid to address");
  check("🔴 the temporary password is NOT stored", !!bad?.html && !bad.html.includes("TempPass99"), true);
  const amp = byTo("amp@x.za");
  check("🔴 a password with & < > is blanked even after HTML escaping", !!amp?.html && !amp.html.includes("Tom&amp;Jerry") && !amp.html.includes("Tom&Jerry"), true);
  check("newest first", sent[0]?.to, "amp@x.za");
  check("one email can be read on its own", (await readSentEmail(month, code!.id))?.to, "chair@x.za");
  check("a wrong id finds nothing", await readSentEmail(month, "00000000-0000-0000-0000-000000000000"), null);

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
