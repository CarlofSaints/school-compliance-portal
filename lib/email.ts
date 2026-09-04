import { Resend } from "resend";
import { resolveBranding } from "@/lib/brandingData";
import type { SchoolBranding } from "@/lib/branding";
import { duePhrase } from "@/lib/actionItems";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// Where links in outgoing mail point.
//
// NEXT_PUBLIC_SITE_URL is the answer to prefer — it is stable and it is the
// domain people actually recognise. But it is deliberately NOT required: a new
// school must be able to come up with nothing configured by hand, and Jeppe ran
// for weeks without it, which meant every button in every email it sent pointed
// at http://localhost:3000. Vercel injects the project URL on every deployment,
// so fall back to that rather than to something that cannot possibly work.
//
// VERCEL_URL is per-deployment and changes on every push, so it is the last
// resort before localhost, not a substitute for setting the real thing.
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const fromVercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (fromVercel) return `https://${fromVercel.replace(/^https?:\/\//, "")}`;
  return "http://localhost:3000";
}

const SITE_URL = resolveSiteUrl();
// Derived per send. These used to be module constants, which meant every
// email carried whichever school the deployment was BUILT for, no matter what
// the school had since set in the portal - and on a shared deployment, no
// matter which school the email was even for.
function logoUrl(b: SchoolBranding): string {
  // Absolute, because a mail client has no idea what a relative path means.
  // Files under /public and /api/branding/logo are both served without a
  // login, so this resolves for a recipient with no account.
  return b.logo.startsWith("http") ? b.logo : `${SITE_URL}${b.logo}`;
}

// The school crest, as an ABSOLUTE url - a mail client has no idea what
// "/logo.png" is relative to. Files under /public are served without a login,
// so this resolves for a recipient who is not signed in (or has no account).
// Per-tenant via branding, so Jeppe's mail carries Jeppe's crest.
//
// Needs NEXT_PUBLIC_SITE_URL to be set on the Vercel project; without it this
// falls back to localhost and the image simply will not load, leaving the alt
// text. Many clients also block remote images until the reader allows them,
// which is why the school name stays as text in the header rather than being
// baked into the image.
function emailShell(b: SchoolBranding, title: string, body: string): string {
  const PRIMARY = b.colors.primary;
  const LOGO_URL = logoUrl(b);
  const branding = b;
  const footerSlogan = branding.slogan
    ? `${branding.fullName} &mdash; "${branding.slogan}"`
    : branding.fullName;
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:${PRIMARY};padding:24px 20px;text-align:center;border-radius:8px 8px 0 0;">
      <div style="background:#fff;border-radius:8px;padding:8px;display:inline-block;margin:0 0 12px;">
        <img src="${LOGO_URL}" alt="${branding.logoAlt}" width="52" style="display:block;width:52px;height:auto;border:0;outline:none;text-decoration:none;">
      </div>
      <h1 style="color:#fff;margin:0;font-size:24px;">${branding.fullName}</h1>
      <p style="color:${branding.colors.primaryTint};margin:4px 0 0;font-size:14px;">${branding.tagline}</p>
    </div>
    <div style="background:#fff;padding:30px;border-radius:0 0 8px 8px;">
      <h2 style="color:${branding.colors.dark};margin:0 0 16px;">${title}</h2>
      ${body}
    </div>
    <div style="text-align:center;padding:20px;color:#888;font-size:12px;">
      <p>${footerSlogan}</p>
    </div>
  </div>
</body>
</html>`;
}

export async function sendWelcomeEmail(
  to: string,
  name: string,
  password: string
): Promise<boolean> {
  const b = await resolveBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const body = `
    <p style="color:#333;">Dear ${name},</p>
    <p style="color:#333;">Welcome to the ${branding.shortName} ${branding.tagline}. Your account has been created.</p>
    <div style="background:#f4f4f5;padding:16px;border-radius:6px;margin:16px 0;">
      <p style="margin:0;color:#333;"><strong>Email:</strong> ${to}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Temporary Password:</strong> ${password}</p>
    </div>
    <p style="color:#333;">Please log in and change your password immediately.</p>
    <a href="${SITE_URL}/login" style="display:inline-block;background:${PRIMARY};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:12px;">Log In Now</a>
  `;
  return sendEmail(b.fromEmail, to, `Welcome to ${branding.shortName} ${branding.portalSubtitle}`, emailShell(b, "Welcome!", body), b.replyTo);
}

// Somebody who has NEVER signed in is not resetting anything, and telling them
// their password is being reset when they were never given one just reads as a
// mistake. Same link, same token, different words.
export async function sendCredentialsSetupEmail(
  to: string,
  name: string,
  token: string,
  ttlMinutes: number
): Promise<boolean> {
  const b = await resolveBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const url = `${SITE_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const body = `
    <p style="color:#333;">Dear ${name},</p>
    <p style="color:#333;">An account has been created for you on the ${branding.shortName} ${branding.tagline}. To get in, choose your own password using the button below.</p>
    <div style="background:#f4f4f5;padding:16px;border-radius:6px;margin:16px 0;">
      <p style="margin:0;color:#333;"><strong>You sign in with:</strong> ${to}</p>
    </div>
    <a href="${url}" style="display:inline-block;background:${PRIMARY};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin:12px 0;">Choose your password</a>
    <p style="color:#666;font-size:13px;">This link works once and expires in ${ttlMinutes} minutes. If it has expired by the time you get to it, use <strong>Forgot your password?</strong> on the sign-in page and it will send you a fresh one.</p>
  `;
  return sendEmail(b.fromEmail, to, `Set up your ${branding.shortName} ${branding.portalSubtitle} account`, emailShell(b, "Set up your account", body), b.replyTo);
}

export async function sendPasswordResetLinkEmail(
  to: string,
  name: string,
  token: string,
  ttlMinutes: number
): Promise<boolean> {
  const b = await resolveBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const url = `${SITE_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const body = `
    <p style="color:#333;">Dear ${name},</p>
    <p style="color:#333;">Someone asked to reset the password for your ${branding.shortName} ${branding.tagline} account. If that was you, choose a new password using the button below.</p>
    <a href="${url}" style="display:inline-block;background:${PRIMARY};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin:12px 0;">Choose a new password</a>
    <p style="color:#666;font-size:13px;">This link works once and expires in ${ttlMinutes} minutes.</p>
    <p style="color:#666;font-size:13px;">If you did not ask for this, you can ignore this email. Your password has not changed.</p>
    <p style="color:#888;font-size:12px;word-break:break-all;">If the button does not work, paste this into your browser:<br>${url}</p>
  `;
  return sendEmail(b.fromEmail, to, `Reset your ${branding.shortName} ${branding.portalSubtitle} password`, emailShell(b, "Reset your password", body), b.replyTo);
}

export async function sendSpendNotificationEmail(
  to: string,
  recipientName: string,
  projectName: string,
  amount: number,
  submittedBy: string
): Promise<boolean> {
  const b = await resolveBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const body = `
    <p style="color:#333;">Dear ${recipientName},</p>
    <p style="color:#333;">A new spend application has been submitted and requires your review.</p>
    <div style="background:#f4f4f5;padding:16px;border-radius:6px;margin:16px 0;">
      <p style="margin:0;color:#333;"><strong>Project:</strong> ${projectName}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Amount:</strong> R${amount.toLocaleString()}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Submitted by:</strong> ${submittedBy}</p>
    </div>
    <a href="${SITE_URL}/spend" style="display:inline-block;background:${PRIMARY};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:12px;">Review Application</a>
  `;
  return sendEmail(b.fromEmail, to, `Spend Application: ${projectName}`, emailShell(b, "New Spend Application", body), b.replyTo);
}

// The applicant's own copy, sent on every submission.
//
// `submitterName` is null when the applicant submitted for themselves, which is
// the common case - naming them as the submitter of their own application reads
// like a stranger did it.
export async function sendApplicantConfirmationEmail(
  to: string,
  applicantName: string,
  submitterName: string | null,
  projectName: string,
  quoteCount: number,
  approverNames: string[]
): Promise<boolean> {
  const b = await resolveBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const intro = submitterName
    ? `${submitterName} has submitted an application for school funds spend on your behalf for: <strong>"${projectName}"</strong>`
    : `Your application for school funds spend has been received for: <strong>"${projectName}"</strong>`;

  // No approvers means the amount fell in a logged-only band. Saying "sent to:"
  // with an empty list would read as though the mail had gone nowhere.
  const routing = approverNames.length
    ? `<p style="color:#333;">It has been sent for approval to: ${approverNames.join(", ")}.</p>`
    : `<p style="color:#333;">This amount does not require approval, so the application has been logged and approved automatically.</p>`;

  const quotes = quoteCount
    ? `<p style="color:#333;">${quoteCount} quote${quoteCount !== 1 ? "s were" : " was"} submitted with it.</p>`
    : "";

  const body = `
    <p style="color:#333;">Dear ${applicantName},</p>
    <p style="color:#333;">${intro}</p>
    ${quotes}
    ${routing}
    <a href="${SITE_URL}/spend" style="display:inline-block;background:${PRIMARY};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:12px;">View Application</a>
  `;
  return sendEmail(b.fromEmail, 
    to,
    `Spend Application Submitted: ${projectName}`,
    emailShell(b, "Application Submitted", body)
  , b.replyTo);
}

async function sendEmail(
  from: string,
  to: string,
  subject: string,
  html: string,
  replyTo?: string
): Promise<boolean> {
  if (!resend) {
    console.log(`[Email] Would send to ${to}: ${subject}`);
    console.log(`[Email] (No RESEND_API_KEY configured)`);
    return true;
  }
  try {
    // replyTo is left OFF when the school has not set one, rather than sent
    // empty: an invalid Reply-To can get the whole message rejected, and a
    // missing one just means a reply goes to the (unread) From address, which
    // is no worse than before.
    await resend.emails.send({ from, to, subject, html, ...(replyTo ? { replyTo } : {}) });
    return true;
  } catch (err) {
    console.error("[Email] Failed to send:", err);
    return false;
  }
}

// Whether a provider is actually wired up. sendEmail() deliberately returns
// true and logs when RESEND_API_KEY is absent, which is fine for a one-off
// action but would make the reminder cron report sends that never happened.
export function isEmailConfigured(): boolean {
  return resend !== null;
}

export async function sendSpendReminderEmail(
  to: string,
  recipientName: string,
  projectName: string,
  amount: number,
  statusLabel: string,
  note: string,
  role: string
): Promise<boolean> {
  const b = await resolveBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const noteBlock = note
    ? `<p style="color:#333;">${note}</p>`
    : `<p style="color:#333;">This is a scheduled reminder about the project below.</p>`;
  const body = `
    <p style="color:#333;">Dear ${recipientName},</p>
    ${noteBlock}
    <div style="background:#f4f4f5;padding:16px;border-radius:6px;margin:16px 0;">
      <p style="margin:0;color:#333;"><strong>Project:</strong> ${projectName}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Amount:</strong> R${amount.toLocaleString()}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Status:</strong> ${statusLabel}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>You are receiving this as:</strong> ${role}</p>
    </div>
    <a href="${SITE_URL}/spend" style="display:inline-block;background:${PRIMARY};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:12px;">Open the Project</a>
  `;
  return sendEmail(b.fromEmail, 
    to,
    `Reminder: ${projectName}`,
    emailShell(b, "Project Reminder", body)
  , b.replyTo);
}

// --- Fund application approval workflow ------------------------------------

// Sent to each required approver when an application is submitted. The buttons
// deep-link into the app rather than carrying a one-click approval token: an
// approval is a decision of record, so the approver signs in and makes it in
// the portal where the full application, the quotes and the other approvers'
// comments are in front of them.
export async function sendApprovalRequestEmail(
  to: string,
  approverName: string,
  spendId: string,
  projectName: string,
  sourceOfFunds: string,
  quoteCount: number,
  amount: number,
  submittedBy: string,
  tierLabel: string,
  requiredBy?: string
): Promise<boolean> {
  const b = await resolveBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const url = `${SITE_URL}/spend/${spendId}`;
  const deadline = requiredBy
    ? `<p style="margin:8px 0 0;color:#333;"><strong>Approval required by:</strong> ${requiredBy}</p>`
    : "";
  const body = `
    <p style="color:#333;">Dear ${approverName},</p>
    <p style="color:#333;">A fund application needs your decision.</p>
    <div style="background:#f4f4f5;padding:16px;border-radius:6px;margin:16px 0;">
      <p style="margin:0;color:#333;"><strong>Project:</strong> ${projectName}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Suggested source of funds:</strong> ${sourceOfFunds || "Not stated"}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Quotes submitted:</strong> ${quoteCount}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Estimated cost:</strong> R${amount.toLocaleString()}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Submitted by:</strong> ${submittedBy}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Approval level:</strong> ${tierLabel}</p>
      ${deadline}
    </div>
    <p style="color:#333;">Open the application to read it in full, then approve, decline, or ask a question.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:12px;">
      <tr>
        <td style="padding-right:8px;">
          <a href="${url}?decision=approve" style="display:inline-block;background:#059669;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">Approve</a>
        </td>
        <td>
          <a href="${url}?decision=decline" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">Decline</a>
        </td>
      </tr>
    </table>
    <p style="color:#888;font-size:12px;margin-top:16px;">Both buttons open the application in the portal, where your decision is recorded against your name.</p>
  `;
  return sendEmail(b.fromEmail, 
    to,
    `Approval needed: ${projectName} (R${amount.toLocaleString()})`,
    emailShell(b, "Fund Application Approval", body)
  , b.replyTo);
}

// Sent to the applicant each time one approver decides.
export async function sendApprovalProgressEmail(
  to: string,
  applicantName: string,
  spendId: string,
  projectName: string,
  approverName: string,
  decision: string,
  comments: string,
  approved: number,
  total: number
): Promise<boolean> {
  const b = await resolveBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const note = comments
    ? `<p style="margin:8px 0 0;color:#333;"><strong>Their comment:</strong> ${comments}</p>`
    : "";
  const body = `
    <p style="color:#333;">Dear ${applicantName},</p>
    <p style="color:#333;">There has been an update on your fund application.</p>
    <div style="background:#f4f4f5;padding:16px;border-radius:6px;margin:16px 0;">
      <p style="margin:0;color:#333;"><strong>Project:</strong> ${projectName}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>${approverName}:</strong> ${decision}</p>
      ${note}
      <p style="margin:8px 0 0;color:#333;"><strong>Progress:</strong> ${approved} of ${total} approvals in</p>
    </div>
    <a href="${SITE_URL}/spend/${spendId}" style="display:inline-block;background:${PRIMARY};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:12px;">View the Application</a>
  `;
  return sendEmail(b.fromEmail, 
    to,
    `Update on ${projectName}: ${approved} of ${total} approved`,
    emailShell(b, "Application Update", body)
  , b.replyTo);
}

// Sent to the applicant once the last approver is in.
export async function sendFullyApprovedEmail(
  to: string,
  applicantName: string,
  spendId: string,
  projectName: string,
  amount: number,
  approverNames: string[]
): Promise<boolean> {
  const b = await resolveBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const body = `
    <p style="color:#333;">Dear ${applicantName},</p>
    <p style="color:#333;">Your fund application has been <strong>fully approved</strong>.</p>
    <div style="background:#f4f4f5;padding:16px;border-radius:6px;margin:16px 0;">
      <p style="margin:0;color:#333;"><strong>Project:</strong> ${projectName}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Approved amount:</strong> R${amount.toLocaleString()}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Approved by:</strong> ${approverNames.join(", ")}</p>
    </div>
    <a href="${SITE_URL}/spend/${spendId}" style="display:inline-block;background:${PRIMARY};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:12px;">View the Application</a>
  `;
  return sendEmail(b.fromEmail, 
    to,
    `Approved: ${projectName}`,
    emailShell(b, "Application Approved", body)
  , b.replyTo);
}

// A nudge sent by hand from the grid, as opposed to the scheduled cron. Says
// plainly that it is a reminder, who asked for it, and how long the request has
// been sitting - a bare re-send of the original reads like a duplicate.
export async function sendApprovalReminderEmail(
  to: string,
  approverName: string,
  spendId: string,
  projectName: string,
  sourceOfFunds: string,
  quoteCount: number,
  amount: number,
  waitingDays: number,
  chasedBy: string,
  stillWaitingOn: string[]
): Promise<boolean> {
  const b = await resolveBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const url = `${SITE_URL}/spend/${spendId}`;
  const others = stillWaitingOn.filter((n) => n !== approverName);
  const alsoWaiting =
    others.length > 0
      ? `<p style="margin:8px 0 0;color:#333;"><strong>Also still to decide:</strong> ${others.join(", ")}</p>`
      : "";
  const waited =
    waitingDays > 0
      ? `It has been waiting ${waitingDays} day${waitingDays === 1 ? "" : "s"}.`
      : "It was submitted today.";
  const body = `
    <p style="color:#333;">Dear ${approverName},</p>
    <p style="color:#333;">This is a reminder that a fund application is waiting for your decision. ${waited}</p>
    <div style="background:#f4f4f5;padding:16px;border-radius:6px;margin:16px 0;">
      <p style="margin:0;color:#333;"><strong>Project:</strong> ${projectName}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Suggested source of funds:</strong> ${sourceOfFunds || "Not stated"}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Quotes submitted:</strong> ${quoteCount}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Estimated cost:</strong> R${amount.toLocaleString()}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Reminder sent by:</strong> ${chasedBy}</p>
      ${alsoWaiting}
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:12px;">
      <tr>
        <td style="padding-right:8px;">
          <a href="${url}?decision=approve" style="display:inline-block;background:#059669;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">Approve</a>
        </td>
        <td>
          <a href="${url}?decision=decline" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">Decline</a>
        </td>
      </tr>
    </table>
    <p style="color:#888;font-size:12px;margin-top:16px;">Both buttons open the application in the portal, where your decision is recorded against your name.</p>
  `;
  return sendEmail(b.fromEmail, 
    to,
    `Reminder: ${projectName} is waiting for your approval`,
    emailShell(b, "Approval Reminder", body)
  , b.replyTo);
}

// --- Action items -----------------------------------------------------------

// Titles, descriptions and notes are typed by people, and an apostrophe or an
// angle bracket in a title should not be able to break the layout of the mail.
// The older templates above predate this and interpolate raw; new copy escapes.
function esc(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// A progress bar that survives a mail client, so it is a table and not a div.
function progressBar(percent: number, PRIMARY: string): string {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:4px 0 0;">
      <tr>
        <td style="background:#e5e7eb;border-radius:999px;height:10px;padding:0;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="${pct}%" style="min-width:1%;">
            <tr><td style="background:${PRIMARY};border-radius:999px;height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>
          </table>
        </td>
      </tr>
    </table>
    <p style="margin:4px 0 0;color:#666;font-size:12px;">${pct}% complete</p>`;
}

// The ETA with the countdown beside it. The countdown itself comes from the
// grid's own helper, so a chase and the screen never disagree about whether
// something is two days late.
function dueLine(dueDate: string, daysLeft: number | null): string {
  if (!dueDate) return "No date set";
  return `${dueDate} (${duePhrase(dueDate, daysLeft).toLowerCase()})`;
}

interface ActionEmailFacts {
  ref: string;
  title: string;
  description: string;
  dueDate: string;
  daysLeft: number | null;
  progress: number;
  statusLabel: string;
  assignedTo: string;
  priorityLabel: string;
}

function actionFactsBlock(facts: ActionEmailFacts, PRIMARY: string): string {
  const overdue = facts.daysLeft !== null && facts.daysLeft < 0;
  return `
    <div style="background:#f4f4f5;padding:16px;border-radius:6px;margin:16px 0;">
      <p style="margin:0;color:#333;"><strong>${esc(facts.ref)}:</strong> ${esc(facts.title)}</p>
      ${facts.description ? `<p style="margin:8px 0 0;color:#555;font-size:14px;">${esc(facts.description)}</p>` : ""}
      <p style="margin:12px 0 0;color:${overdue ? "#dc2626" : "#333"};"><strong>Due:</strong> ${esc(dueLine(facts.dueDate, facts.daysLeft))}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Assigned to:</strong> ${esc(facts.assignedTo || "Nobody yet")}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Priority:</strong> ${esc(facts.priorityLabel)}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Status:</strong> ${esc(facts.statusLabel)}</p>
      ${progressBar(facts.progress, PRIMARY)}
    </div>`;
}

// Sent the moment somebody is put on an action, so the first they hear of it is
// not a chase three days before it is due.
export async function sendActionAssignedEmail(
  to: string,
  recipientName: string,
  raisedByName: string,
  facts: ActionEmailFacts
): Promise<boolean> {
  const b = await resolveBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const body = `
    <p style="color:#333;">Dear ${esc(recipientName)},</p>
    <p style="color:#333;">${esc(raisedByName)} has assigned you an action item.</p>
    ${actionFactsBlock(facts, PRIMARY)}
    <p style="color:#333;">Please update your progress in the portal as the work moves along. You will get a reminder before it is due.</p>
    <a href="${SITE_URL}/action-items" style="display:inline-block;background:${PRIMARY};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:12px;">Open the action</a>
  `;
  return sendEmail(b.fromEmail, 
    to,
    `Action ${facts.ref}: ${facts.title}`,
    emailShell(b, "You have a new action item", body)
  , b.replyTo);
}

// The scheduled chase. `why` states plainly which of the three it is (heads-up,
// due today, or overdue) so the same mail is never mistaken for a duplicate.
export async function sendActionReminderEmail(
  to: string,
  recipientName: string,
  role: string,
  why: string,
  facts: ActionEmailFacts,
  note = ""
): Promise<boolean> {
  const b = await resolveBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const overdue = facts.daysLeft !== null && facts.daysLeft < 0;
  const body = `
    <p style="color:#333;">Dear ${esc(recipientName)},</p>
    <p style="color:#333;">${esc(why)}</p>
    ${note ? `<p style="color:#333;">${esc(note)}</p>` : ""}
    ${actionFactsBlock(facts, PRIMARY)}
    <p style="color:#666;font-size:13px;">You are receiving this as: ${esc(role)}</p>
    <a href="${SITE_URL}/action-items" style="display:inline-block;background:${overdue ? "#dc2626" : PRIMARY};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:12px;">Update the progress</a>
  `;
  const subject = overdue
    ? `Overdue: ${facts.ref} ${facts.title}`
    : `Reminder: ${facts.ref} ${facts.title}`;
  return sendEmail(b.fromEmail, 
    to,
    subject,
    emailShell(b, overdue ? "An action is overdue" : "Action item reminder", body)
  , b.replyTo);
}
