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
