import { Resend } from "resend";
import { branding } from "@/lib/branding";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const FROM_EMAIL = branding.fromEmail;
const PRIMARY = branding.colors.primary;

function emailShell(title: string, body: string): string {
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
    <div style="background:${PRIMARY};padding:20px;text-align:center;border-radius:8px 8px 0 0;">
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
  return sendEmail(to, `Welcome to ${branding.shortName} ${branding.portalSubtitle}`, emailShell("Welcome!", body));
}

export async function sendSpendNotificationEmail(
  to: string,
  recipientName: string,
  projectName: string,
  amount: number,
  submittedBy: string
): Promise<boolean> {
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
  return sendEmail(to, `Spend Application: ${projectName}`, emailShell("New Spend Application", body));
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  newPassword: string
): Promise<boolean> {
  const body = `
    <p style="color:#333;">Dear ${name},</p>
    <p style="color:#333;">Your password has been reset by an administrator.</p>
    <div style="background:#f4f4f5;padding:16px;border-radius:6px;margin:16px 0;">
      <p style="margin:0;color:#333;"><strong>New Password:</strong> ${newPassword}</p>
    </div>
    <p style="color:#333;">Please log in and change your password immediately.</p>
    <a href="${SITE_URL}/login" style="display:inline-block;background:${PRIMARY};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:12px;">Log In Now</a>
  `;
  return sendEmail(to, `Password Reset - ${branding.shortName} Portal`, emailShell("Password Reset", body));
}

export async function sendApplicantConfirmationEmail(
  to: string,
  applicantName: string,
  submitterName: string,
  projectName: string,
  quoteCount: number,
  approverNames: string[]
): Promise<boolean> {
  const approverList = approverNames.join(", ");
  const body = `
    <p style="color:#333;">Dear ${applicantName},</p>
    <p style="color:#333;">${submitterName} has submitted an application for school funds spend for: <strong>"${projectName}"</strong></p>
    <p style="color:#333;">${quoteCount} quote${quoteCount !== 1 ? "s were" : " was"} submitted — see copies attached.</p>
    <p style="color:#333;">A copy of this application has been sent to: ${approverList}.</p>
    <a href="${SITE_URL}/spend" style="display:inline-block;background:${PRIMARY};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:12px;">View Application</a>
  `;
  return sendEmail(
    to,
    `Spend Application Submitted: ${projectName}`,
    emailShell("Application Submitted", body)
  );
}

async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  if (!resend) {
    console.log(`[Email] Would send to ${to}: ${subject}`);
    console.log(`[Email] (No RESEND_API_KEY configured)`);
    return true;
  }
  try {
    await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
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
  return sendEmail(
    to,
    `Reminder: ${projectName}`,
    emailShell("Project Reminder", body)
  );
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
  return sendEmail(
    to,
    `Approval needed: ${projectName} (R${amount.toLocaleString()})`,
    emailShell("Fund Application Approval", body)
  );
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
  return sendEmail(
    to,
    `Update on ${projectName}: ${approved} of ${total} approved`,
    emailShell("Application Update", body)
  );
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
  return sendEmail(
    to,
    `Approved: ${projectName}`,
    emailShell("Application Approved", body)
  );
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
  return sendEmail(
    to,
    `Reminder: ${projectName} is waiting for your approval`,
    emailShell("Approval Reminder", body)
  );
}
