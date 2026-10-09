// Renders every portal email with made-up data so the look can be checked in a
// browser. Nothing is sent: the mail provider's network call is caught and the
// HTML written to disk instead, and every other network call is refused, so no
// store is read and the school's built-in branding is used.
//
//   NEXT_PUBLIC_SCHOOL=hvps npx tsx scripts/render-emails.ts <outDir>
//
// Writes one .html per email plus index.html, which shows them all.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SummaryRow } from "../lib/actionSummary";

const outDir = process.argv[2];
if (!outDir) {
  console.error("usage: npx tsx scripts/render-emails.ts <outDir>");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

// Before email.ts loads: it builds its client from this at import time.
process.env.RESEND_API_KEY = "re_preview_only";
delete process.env.BLOB_READ_WRITE_TOKEN;

let captured: { subject: string; html: string } | null = null;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.includes("api.resend.com")) throw new Error(`preview: refused ${url}`);
  const body = JSON.parse(String(init?.body ?? "{}"));
  captured = { subject: body.subject, html: body.html };
  return new Response(JSON.stringify({ id: "preview" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

async function main() {
  const email = await import("../lib/email");
  const { resolveBranding } = await import("../lib/brandingData");
  const b = await resolveBranding();

  const shots: { name: string; subject: string }[] = [];
  const grab = async (name: string, send: () => Promise<unknown>) => {
    captured = null;
    await send();
    if (!captured) throw new Error(`${name}: nothing captured`);
    const { subject, html } = captured as { subject: string; html: string };
    writeFileSync(join(outDir, `${name}.html`), html);
    shots.push({ name, subject });
  };
  const keep = (name: string, m: { subject: string; html: string }) => {
    writeFileSync(join(outDir, `${name}.html`), m.html);
    shots.push({ name, subject: m.subject });
  };

  const to = "thandi@example.com";
  const facts = {
    ref: "AI-014",
    title: "Replace the broken fence along the sports field",
    description: "Get three quotes and present them at the next FINCOM meeting.",
    dueDate: "2026-10-06",
    daysLeft: -3,
    progress: 40,
    statusLabel: "In progress",
    assignedTo: "Thandi Mokoena, Peter van Wyk",
    priorityLabel: "High",
  };

  await grab("01-welcome", () => email.sendWelcomeEmail(to, "Thandi Mokoena", "Temp-4821"));
  await grab("02-set-up-account", () => email.sendCredentialsSetupEmail(to, "Thandi Mokoena", "tok", 60));
  await grab("03-password-reset", () => email.sendPasswordResetLinkEmail(to, "Thandi Mokoena", "tok", 60));
  await grab("04-minutes-for-review", () =>
    email.sendMinutesForReviewEmail(to, "Thandi Mokoena", "m1", "SGB Meeting Minutes", "September 2026", 2, "Lerato Dlamini"));
  await grab("05-minutes-changes-requested", () =>
    email.sendMinutesChangesRequestedEmail(to, "Lerato Dlamini", "m1", "SGB Meeting Minutes", "Peter van Wyk",
      "Item 4.2: the amount approved for the fence was R48 000, not R84 000.\nPlease also add Mrs Naidoo to the apologies."));
  await grab("06-minutes-ready-to-sign", () =>
    email.sendMinutesReadyToSignEmail(to, "Thandi Mokoena", "m1", "SGB Meeting Minutes", "September 2026"));
  await grab("07-minutes-signing-code", () =>
    email.sendMinutesSigningCodeEmail(to, "Thandi Mokoena", "m1", "SGB Meeting Minutes", "September 2026", "482915"));
  await grab("08-minutes-signed", () =>
    email.sendMinutesSignedEmail(to, "Thandi Mokoena", "m1", "SGB Meeting Minutes", "September 2026",
      ["Thandi Mokoena", "Peter van Wyk", "Lerato Dlamini"], "MIN-2026-09-7F3A",
      { filename: "SGB Minutes September 2026.docx", content: Buffer.from("x") }));
  await grab("09-spend-new", () => email.sendSpendNotificationEmail(to, "Thandi Mokoena", "Sports field fence", 48000, "Peter van Wyk"));
  await grab("10-spend-submitted", () =>
    email.sendApplicantConfirmationEmail(to, "Peter van Wyk", null, "Sports field fence", 3, ["Thandi Mokoena", "Ravi Naidoo"]));
  await grab("11-spend-reminder", () =>
    email.sendSpendReminderEmail(to, "Thandi Mokoena", "Sports field fence", 48000, "Awaiting approval", "", "Approver"));
  await grab("12-approval-request", () =>
    email.sendApprovalRequestEmail(to, "Thandi Mokoena", "s1", "Sports field fence", "CAPEX", 3, 48000, "Peter van Wyk", "FINCOM (R10 000+)", "15 October 2026"));
  await grab("13-approval-progress", () =>
    email.sendApprovalProgressEmail(to, "Peter van Wyk", "s1", "Sports field fence", "Thandi Mokoena", "approved", "Go with quote 2.", 1, 3));
  await grab("14-fully-approved", () =>
    email.sendFullyApprovedEmail(to, "Peter van Wyk", "s1", "Sports field fence", 48000, ["Thandi Mokoena", "Ravi Naidoo", "Lerato Dlamini"]));
  await grab("15-approval-reminder", () =>
    email.sendApprovalReminderEmail(to, "Thandi Mokoena", "s1", "Sports field fence", "CAPEX", 3, 48000, 4, "Peter van Wyk", ["Thandi Mokoena", "Ravi Naidoo"]));
  await grab("16-action-assigned", () =>
    email.sendActionAssignedEmail(to, "Thandi Mokoena", "Lerato Dlamini", { ...facts, dueDate: "2026-10-20", daysLeft: 11, progress: 0, statusLabel: "Not started" }));
  await grab("17-action-reminder", () =>
    email.sendActionReminderEmail(to, "Thandi Mokoena", "Responsible", "This action is due in 3 days.", { ...facts, dueDate: "2026-10-12", daysLeft: 3 }));
  await grab("18-action-overdue", () =>
    email.sendActionReminderEmail(to, "Thandi Mokoena", "Responsible", "This action is now 3 days overdue.", facts));

  keep("19-weekly-update", email.buildWeeklyUpdateEmail(b, to, "Thandi Mokoena", {
    teamName: b.shortName,
    weekOf: "2026-10-05",
    notActivated: true,
    seesSpend: true,
    facts: {
      actions: {
        open: 12, overdue: 3, dueThisWeek: 2,
        overdueList: [
          { ref: "AI-014", title: "Replace the broken fence", owners: "Thandi Mokoena", due: "2026-10-06", daysLate: 3 },
          { ref: "AI-009", title: "Update the admissions policy", owners: "Ravi Naidoo", due: "2026-10-08", daysLate: 1 },
        ],
      },
      accounts: { total: 18, notActivated: 4 },
      minutes: [{ title: "SGB Meeting Minutes", period: "September 2026", signed: 2, total: 4, waitingOn: ["Ravi Naidoo", "Peter van Wyk"] }],
      spend: {
        awaiting: 2, awaitingValue: 61500, approved: 3, approvedValue: 128000, changes: 1, completed: 5,
        awaitingList: [
          { project: "Sports field fence", amount: 48000, approved: 1, total: 3, waitingOn: ["Ravi Naidoo", "Lerato Dlamini"], noApprovers: false },
          { project: "Library books", amount: 13500, approved: 0, total: 0, waitingOn: [], noApprovers: true },
        ],
      },
    },
  }));

  const row = (over: Partial<SummaryRow>): SummaryRow => ({
    ref: "AI-001", title: "", description: "", category: "", priority: "High", status: "In progress",
    statusKey: "in_progress", priorityKey: "high", progress: 40, owners: "Thandi Mokoena", ownerList: ["Thandi Mokoena"],
    dueDate: "2026-10-06", daysLeft: -3, health: "overdue", latestNote: "", latestNoteBy: "", latestNoteOn: "",
    raisedBy: "", raisedOn: "", fromMeeting: "", ...over,
  } as SummaryRow);
  keep("20-action-summary", email.buildActionSummaryEmail(b, "Thandi Mokoena", {
    rows: [
      row({ ref: "AI-014", title: "Replace the broken fence" }),
      row({ ref: "AI-009", title: "Update the admissions policy", owners: "Ravi Naidoo", dueDate: "2026-10-08", daysLeft: -1, progress: 75 }),
      row({ ref: "AI-021", title: "Book the hall for prize-giving", owners: "Lerato Dlamini", dueDate: "2026-10-13", daysLeft: 4, health: "due_soon", progress: 10 }),
    ],
    counts: { open: 12, overdue: 2, dueSoon: 1, onTrack: 7, noDate: 2, blocked: 1, unassigned: 0 },
    dueSoonDays: 7,
    asOf: "2026-10-09",
    scheduleText: "Every Monday at 07:00",
  }));

  const index = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${b.shortName} emails</title>
<style>body{margin:0;background:#e5e7eb;font-family:system-ui,sans-serif}h1{padding:20px 24px 0;margin:0;font-size:20px}
.grid{display:flex;flex-wrap:wrap;gap:24px;padding:24px}.shot{width:640px}.shot p{margin:0 0 6px;font-size:13px;color:#374151}
iframe{width:640px;height:820px;border:0;border-radius:8px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.15)}</style></head>
<body><h1>${b.fullName}: every portal email</h1><div class="grid">${shots
    .map((s) => `<div class="shot"><p><strong>${s.name}</strong> &middot; ${s.subject.replace(/</g, "&lt;")}</p><iframe src="${s.name}.html"></iframe></div>`)
    .join("")}</div></body></html>`;
  writeFileSync(join(outDir, "index.html"), index);
  console.log(`wrote ${shots.length} emails to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
