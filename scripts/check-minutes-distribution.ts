// Sending signed minutes to the governing body, and raising actions from a
// minute. No server.
//
//   npx tsx scripts/check-minutes-distribution.ts
//
// 🔴 The two rules that matter:
//
//   1. "Signed" is not the only closed state. A school that signs on PAPER
//      never passes through the signing route, so before the send button
//      those minutes reached nobody at all.
//   2. An action's origin is resolved from the MINUTES, never taken from the
//      caller - an action item's whole authority is "the SGB minuted this".

import {
  canDistribute,
  audienceForBody,
  AUDIENCE_LABELS,
  type MinutesStatus,
} from "../lib/minutes";

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.error(
      `  FAIL ${label}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`
    );
  }
}
const checkThat = (label: string, cond: boolean) => check(label, cond, true);

console.log("\nOnly finished minutes go out as final");
{
  const drafts: MinutesStatus[] = [
    "draft",
    "in_review",
    "changes_requested",
    "awaiting_signatures",
  ];
  for (const s of drafts) {
    check(`${s} cannot be distributed`, canDistribute(s, false), false);
  }
  checkThat("signed can be", canDistribute("signed", false));

  // ⚠️ Nothing in the app SETS "archived" today - it is a declared status with
  // no writer - so this is a rule waiting for a feature rather than one in
  // force. Pinned here so whoever adds archiving has to decide deliberately.
  //
  // 🔴 Archived is NOT the same as signed, though isLocked treats them alike.
  // A draft can be archived without ever being agreed, and circulating that as
  // the final record of a meeting is precisely the mistake this guards. An
  // archived set that WAS signed still carries its signatures, so it passes on
  // that count and not on being archived.
  check(
    "archived on its own is not enough - it is not proof of signing",
    canDistribute("archived", false),
    false
  );
  checkThat(
    "archived minutes with a signed copy can still be re-sent",
    canDistribute("archived", true)
  );
}

console.log("\n🔴 Wet ink closes minutes without the status ever reaching signed");
{
  // This is the case the button exists for. The upload route sets no status,
  // so a school that signs on paper had NOTHING distribute its minutes.
  checkThat(
    "awaiting_signatures + a scan is distributable",
    canDistribute("awaiting_signatures", true)
  );
  checkThat("a draft + a scan is distributable", canDistribute("draft", true));
  check(
    "but a draft with no scan is still not",
    canDistribute("draft", false),
    false
  );
}

console.log("\nThe distribution list follows the MEETING, not the status");
{
  check("FINCOM minutes go to the FINCOM list", audienceForBody("fincom"), "fincom");
  check("SGB minutes go to the SGB list", audienceForBody("sgb"), "sgb");
  // 🔴 "Other" must not silently fall through to nothing. A school minuting a
  // disciplinary panel still has to be able to circulate it, and the SGB list
  // is the only defensible default - the alternative is minutes that reach
  // nobody with no error to explain why.
  check("anything else falls back to the SGB list", audienceForBody("other"), "sgb");

  // The panel and the refusal message both name the audience out loud, so a
  // secretary is told WHICH list is unconfigured rather than "nobody is set
  // up". Every audience must therefore have a label.
  for (const a of ["draft", "signing", "signed", "sgb", "fincom"] as const) {
    checkThat(`${a} has a label to name it by`, !!AUDIENCE_LABELS[a]);
  }
}

(async () => {
  console.log("\nThe signed-minutes email lists each person's OWN open actions");
  process.env.RESEND_API_KEY = "re_check_not_real";
  let html = "";
  let attachments: { filename: string; contentId?: string; content_id?: string }[] = [];
  process.env.NEXT_PUBLIC_SCHOOL ||= "hvps"; // a school with a built-in crest
  globalThis.fetch = (async (_u: unknown, init?: { body?: string }) => {
    const body = JSON.parse(init?.body || "{}");
    html = body.html || "";
    attachments = body.attachments || [];
    return new Response(JSON.stringify({ id: "x" }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const { openActionsByEmail } = await import("../lib/minutesDistribution");
  const { sendMinutesSignedEmail } = await import("../lib/email");
  const { meetingWhen } = await import("../lib/minutes");


  const from = { minutesId: "m1", minutesTitle: "T", minutesPeriod: "October 2026" };
  const items = [
    { id: "a1", title: "Fix the borehole", dueDate: "2026-10-30", status: "in_progress", assigneeIds: ["p1"], fromMinutes: from },
    { id: "a2", title: "Order STEM kits", dueDate: "", status: "not_started", assigneeIds: ["p1", "p2"], fromMinutes: from },
    { id: "a3", title: "Already done", dueDate: "", status: "done", assigneeIds: ["p1"], fromMinutes: from },
    { id: "a4", title: "Cancelled", dueDate: "", status: "cancelled", assigneeIds: ["p1"], fromMinutes: from },
    { id: "a6", title: "Shared mailbox job", dueDate: "", status: "not_started", assigneeIds: ["p4", "p5"], fromMinutes: from },
    { id: "a5", title: "Other meeting", dueDate: "", status: "not_started", assigneeIds: ["p1"], fromMinutes: { ...from, minutesId: "m2" } },
  ] as Parameters<typeof openActionsByEmail>[1];
  const people = [
    { id: "p1", email: " Derek@School.co.za " },
    { id: "p2", email: "old-dee@school.co.za", userId: "u2" },
    { id: "p3", email: "" },
    { id: "p4", email: "office@school.co.za" },
    { id: "p5", email: "Office@school.co.za" },
  ];
  const users = [{ id: "u2", email: "dee@school.co.za" }];
  const map = openActionsByEmail("m1", items, people, users);
  check("Derek gets his two open actions from THIS meeting", map.get("derek@school.co.za")?.map((a) => a.title), ["Fix the borehole", "Order STEM kits"]);
  check("Dee gets only the shared one", map.get("dee@school.co.za")?.map((a) => a.title), ["Order STEM kits"]);
  check("Dee's actions are found under her login email", map.get("dee@school.co.za")?.map((a) => a.title), ["Order STEM kits"]);
  check("and under her register email, which the list may mail instead", map.get("old-dee@school.co.za")?.map((a) => a.title), ["Order STEM kits"]);
  check("two register entries sharing one mailbox list the action once", map.get("office@school.co.za")?.map((a) => a.title), ["Shared mailbox job"]);
  check("nobody else is listed", [...map.keys()].length, 4);
  check("a custom period with no usable dates never shows its label", meetingWhen({ kind: "custom", year: 2026, from: "", to: "", label: "Special AGM" }), "in 2026");

  check("a single-day meeting reads 'on <date>'", meetingWhen({ kind: "custom", year: 2026, from: "2026-10-15", to: "2026-10-15" }), "on 15 October 2026");
  check("a custom range reads 'from <date> to <date>', not its label", meetingWhen({ kind: "custom", year: 2026, from: "2026-10-01", to: "2026-10-15", label: "Special meeting" }), "from 1 October 2026 to 15 October 2026");
  const { checkMeetingDate, minutesWhenLabel, canonicalMinutes } = await import("../lib/minutes");
  check("a meeting date beats the period", meetingWhen({ kind: "month", year: 2026, month: 10 }, "2026-10-15"), "on 15 October 2026");
  check("a valid meeting date passes", checkMeetingDate("2026-10-15"), null);
  checkThat("a missing meeting date is refused", !!checkMeetingDate(""));
  checkThat("an impossible date is refused", !!checkMeetingDate("2026-02-30"));
  check("the label shows the date and the period", minutesWhenLabel({ period: { kind: "month", year: 2026, month: 10 }, meetingDate: "2026-10-15" }), "Held 15 October 2026 · October 2026");
  check("without a date the label is just the period", minutesWhenLabel({ period: { kind: "month", year: 2026, month: 10 } }), "October 2026");
  const base = { title: "T", body: "sgb" as const, period: { kind: "month" as const, year: 2026, month: 10 }, sections: [] };
  check("🔴 minutes with no date sign exactly as before (old signatures stay valid)", canonicalMinutes(base), ["T", "sgb", "October 2026"].join("\u001e"));
  checkThat("the meeting date IS part of what is signed", canonicalMinutes({ ...base, meetingDate: "2026-10-15" }) !== canonicalMinutes(base));
  check("a month reads 'in <month>'",meetingWhen({ kind: "month", year: 2026, month: 10 }), "in October 2026");

  await sendMinutesSignedEmail("d@x.za", "Derek", "m1", "Ad hoc <SGB>", "October 2026", "in October 2026", ["Dee (Principal)"], map.get("derek@school.co.za")!, true, null);
  checkThat("email lists the actions", html.includes("Fix the borehole") && html.includes("Order STEM kits"));
  checkThat("with the due date", html.includes("(due 30 October 2026)"));
  checkThat("and the Action Item List link", html.includes("/action-items") && html.includes("Action Item List"));
  checkThat("without an attachment it does not claim one", html.includes("have been signed") && !html.includes("attached"));
  checkThat("the title is escaped", html.includes("Ad hoc &lt;SGB&gt;"));
  await sendMinutesSignedEmail("k@x.za", "Kubeshini", "m1", "T", "October 2026", "in October 2026", ["Dee (Principal)"], [], true, null);
  checkThat("someone with no actions gets no action list", !html.includes("yours to execute"));
  await sendMinutesSignedEmail("o@x.za", "Office", "m1", "T", "October 2026", "in October 2026", ["Dee (Principal)"], map.get("office@school.co.za")!, false, null);
  checkThat("the crest is linked, with nothing attached", html.includes("/logo.png") && attachments.length === 0);
  checkThat("someone with no login gets their actions but no portal link", html.includes("Shared mailbox job") && !html.includes("/action-items"));

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
