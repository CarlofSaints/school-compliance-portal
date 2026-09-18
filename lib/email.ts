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
  // A school with no crest yet gets NO url, and the header block is left out
  // rather than pointed at a default. `${SITE_URL}` with an empty logo would
  // otherwise resolve to the site root and render as a broken image.
  if (!b.logo) return "";
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
      ${
        // 🔴 The crest block is omitted entirely when a school has none, and
        // never falls back to a file. The fallback used to be /logo.png, which
        // is Hurlyvale's actual crest, so every email a new school sent went
        // out under another school's badge - to that school's own governors.
        //
        // Nothing is drawn in its place: an inline SVG is the one thing mail
        // clients are worst at, and the school's NAME is already directly
        // underneath. A header with no crest reads as plain; a header with a
        // broken image reads as a forgery.
        LOGO_URL
          ? `<div style="background:#fff;border-radius:8px;padding:8px;display:inline-block;margin:0 0 12px;">
        <img src="${LOGO_URL}" alt="${branding.logoAlt}" width="52" style="display:block;width:52px;height:auto;border:0;outline:none;text-decoration:none;">
      </div>`
          : ""
      }
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

// The draft, out for checking. Carl: it "explains that this is draft 1, asks
// them to check it and then a link in the email directs them to the doc, so
// they can approve or decline with comments".
export async function sendMinutesForReviewEmail(
  to: string,
  recipientName: string,
  minutesId: string,
  minutesTitle: string,
  periodLabel: string,
  draftNumber: number,
  fromName: string
): Promise<boolean> {
  const b = await resolveBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const url = `${SITE_URL}/minutes/${minutesId}`;
  const body = `
    <p style="color:#333;">Dear ${recipientName},</p>
    <p style="color:#333;">${esc(fromName)} has sent you <strong>draft ${draftNumber}</strong> of the minutes below to check.</p>
    <div style="background:#f4f4f5;padding:16px;border-radius:6px;margin:16px 0;">
      <p style="margin:0;color:#333;"><strong>${esc(minutesTitle)}</strong></p>
      <p style="margin:6px 0 0;color:#555;font-size:14px;">${esc(periodLabel)}</p>
    </div>
    <p style="color:#333;">Please read it and either approve it, or send it back with a note saying what needs changing.</p>
    <a href="${url}" style="display:inline-block;background:${PRIMARY};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:12px;">Read and respond</a>
  `;
  return sendEmail(
    b.fromEmail,
    to,
    `Please check: ${minutesTitle}`,
    emailShell(b, "Minutes to check", body),
    b.replyTo
  );
}

// Back to the secretary when somebody asks for changes. Carl: "Secretary then
// gets an email to notifying them that there are issues with the minutes that
// need rectifying".
export async function sendMinutesChangesRequestedEmail(
  to: string,
  secretaryName: string,
  minutesId: string,
  minutesTitle: string,
  reviewerName: string,
  comments: string
): Promise<boolean> {
  const b = await resolveBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const url = `${SITE_URL}/minutes/${minutesId}`;
  const body = `
    <p style="color:#333;">Dear ${secretaryName},</p>
    <p style="color:#333;"><strong>${esc(reviewerName)}</strong> has asked for changes to <strong>${esc(minutesTitle)}</strong> before it goes out for signing.</p>
    ${
      comments
        ? `<div style="background:#fffbeb;border-left:3px solid #f59e0b;padding:12px 16px;margin:16px 0;"><p style="margin:0;color:#78350f;white-space:pre-wrap;">${esc(comments)}</p></div>`
        : `<p style="color:#666;font-size:14px;">No note was left, so it is worth asking them what needs changing.</p>`
    }
    <a href="${url}" style="display:inline-block;background:${PRIMARY};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:12px;">Open the minutes</a>
  `;
  return sendEmail(
    b.fromEmail,
    to,
    `Changes requested: ${minutesTitle}`,
    emailShell(b, "Changes requested", body),
    b.replyTo
  );
}

// Everyone has approved and it is ready to sign.
export async function sendMinutesReadyToSignEmail(
  to: string,
  recipientName: string,
  minutesId: string,
  minutesTitle: string,
  periodLabel: string
): Promise<boolean> {
  const b = await resolveBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const url = `${SITE_URL}/minutes/${minutesId}`;
  const body = `
    <p style="color:#333;">Dear ${recipientName},</p>
    <p style="color:#333;">The minutes below have been checked and are ready for your signature.</p>
    <div style="background:#f4f4f5;padding:16px;border-radius:6px;margin:16px 0;">
      <p style="margin:0;color:#333;"><strong>${esc(minutesTitle)}</strong></p>
      <p style="margin:6px 0 0;color:#555;font-size:14px;">${esc(periodLabel)}</p>
    </div>
    <p style="color:#333;">Open it, read it through, and sign it off.</p>
    <a href="${url}" style="display:inline-block;background:${PRIMARY};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:12px;">Read and sign</a>
    <p style="color:#666;font-size:13px;margin-top:16px;">Once everyone has signed, the minutes are locked and cannot be changed. If something is still wrong, send it back rather than signing.</p>
  `;
  return sendEmail(
    b.fromEmail,
    to,
    `Ready to sign: ${minutesTitle}`,
    emailShell(b, "Ready to sign", body),
    b.replyTo
  );
}

// The code somebody types to sign. Sent to them, never shown on the page: what
// makes an ordinary electronic signature stand up is that the signer did
// something deliberate that only they could do, and clicking a button while
// logged in is not that.
export async function sendMinutesSigningCodeEmail(
  to: string,
  recipientName: string,
  minutesId: string,
  minutesTitle: string,
  periodLabel: string,
  code: string
): Promise<boolean> {
  const b = await resolveBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  // Straight to the document with the signature pad on it, not the summary
  // page: the link in a "please sign" email should open the thing to sign.
  const url = `${SITE_URL}/minutes/${minutesId}/sign`;
  const body = `
    <p style="color:#333;">Dear ${recipientName},</p>
    <p style="color:#333;">The minutes below have been checked and are ready for your signature.</p>
    <div style="background:#f4f4f5;padding:16px;border-radius:6px;margin:16px 0;">
      <p style="margin:0;color:#333;"><strong>${esc(minutesTitle)}</strong></p>
      <p style="margin:6px 0 0;color:#555;font-size:14px;">${esc(periodLabel)}</p>
    </div>
    <p style="color:#333;">Read them through, then sign with this code:</p>
    <p style="font-family:monospace;font-size:30px;letter-spacing:6px;font-weight:bold;color:${PRIMARY};margin:8px 0 20px;">${esc(code)}</p>
    <a href="${url}" style="display:inline-block;background:${PRIMARY};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">Read and sign</a>
    <p style="color:#666;font-size:13px;margin-top:20px;">The code is yours alone. Do not pass it on: whoever uses it signs in your name.</p>
    <p style="color:#666;font-size:13px;">Once everyone has signed, the minutes are locked and cannot be changed. If something is still wrong, ask the secretary to pull them back rather than signing.</p>
  `;
  return sendEmail(
    b.fromEmail,
    to,
    `Your signing code: ${minutesTitle}`,
    emailShell(b, "Ready to sign", body),
    b.replyTo
  );
}

// Everybody has signed. This goes to the distribution list for the body, so
// the whole SGB or FINCOM gets the final record.
export async function sendMinutesSignedEmail(
  to: string,
  recipientName: string,
  minutesId: string,
  minutesTitle: string,
  periodLabel: string,
  signedBy: string[],
  documentRef: string,
  /** The signed minutes themselves. Absent when the file could not be built,
   *  in which case the email still goes, with its link. */
  attachment?: EmailAttachment | null
): Promise<boolean> {
  const b = await resolveBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const url = `${SITE_URL}/minutes/${minutesId}`;
  const body = `
    <p style="color:#333;">Dear ${recipientName},</p>
    <p style="color:#333;">The minutes below have been signed and are now the final record.${
      attachment ? ` A copy is attached to this email (${esc(attachment.filename)}).` : ""
    }</p>
    <div style="background:#f4f4f5;padding:16px;border-radius:6px;margin:16px 0;">
      <p style="margin:0;color:#333;"><strong>${esc(minutesTitle)}</strong></p>
      <p style="margin:6px 0 0;color:#555;font-size:14px;">${esc(periodLabel)}</p>
      <p style="margin:10px 0 0;color:#555;font-size:14px;">Signed by ${esc(signedBy.join(", "))}</p>
    </div>
    <a href="${url}" style="display:inline-block;background:${PRIMARY};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">Read the signed minutes</a>
    <p style="color:#666;font-size:13px;margin-top:20px;">Document reference ${esc(documentRef)}. This identifies the exact wording that was signed, so a later copy can be checked against it.</p>
  `;
  return sendEmail(
    b.fromEmail,
    to,
    `Signed: ${minutesTitle}`,
    emailShell(b, "Signed minutes", body),
    b.replyTo,
    attachment ? [attachment] : undefined
  );
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

/** A file sent with an email. Resend's limit is 40MB for the whole message
 *  after encoding; a set of minutes, or a scan capped at 15MB on upload, fits. */
export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

async function sendEmail(
  from: string,
  to: string,
  subject: string,
  html: string,
  replyTo?: string,
  attachments?: EmailAttachment[]
): Promise<boolean> {
  if (!resend) {
    console.log(`[Email] Would send to ${to}: ${subject}`);
    if (attachments?.length) {
      console.log(`[Email] With ${attachments.map((a) => `${a.filename} (${a.content.length} bytes)`).join(", ")}`);
    }
    console.log(`[Email] (No RESEND_API_KEY configured)`);
    return true;
  }
  try {
    // replyTo is left OFF when the school has not set one, rather than sent
    // empty: an invalid Reply-To can get the whole message rejected, and a
    // missing one just means a reply goes to the (unread) From address, which
    // is no worse than before.
    const message = { from, to, subject, html, ...(replyTo ? { replyTo } : {}) };

    // 🔴 Resend does not THROW on a rejected message, it RETURNS { error }.
    // This used to await the call and return true regardless, so a message
    // Resend refused was counted as sent and nobody found out.
    let { error } = await resend.emails.send({
      ...message,
      ...(attachments?.length ? { attachments } : {}),
    });

    // A refused attachment must not cost the email itself. Signed minutes that
    // arrive with only their link beat signed minutes that never arrive.
    if (error && attachments?.length) {
      console.error(
        `[Email] Rejected with attachment to ${to}, retrying without it:`,
        error
      );
      ({ error } = await resend.emails.send(message));
    }

    if (error) {
      console.error(`[Email] Resend refused the message to ${to}:`, error);
      return false;
    }
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

// --- Weekly SGB update --------------------------------------------------------
//
// Built from tables, not flex or grid: Outlook draws email with Word's layout
// engine, and anything else collapses the three cards into one column of
// unstyled text. Colours come from the school's own branding like every other
// mail here, so Hurlyvale's update is cyan and Jeppe's is black.

const WEEKLY_LIST_CAP = 5;

// Icons are emoji written as HTML entities. An SVG icon is stripped by Gmail
// and Outlook, and an image icon is blocked until the reader allows images;
// emoji are the one kind every mail client draws. Entities, not literal
// characters, so no encoding step anywhere can mangle them.
const WEEKLY_ICONS = {
  actions: "&#128203;", // clipboard
  notSignedIn: "&#128100;", // person
  minutes: "&#9997;&#65039;", // writing hand
  awaiting: "&#9203;", // hourglass
  approved: "&#9989;", // green tick
  sentBack: "&#8617;&#65039;", // return arrow
};

function weeklyCard(icon: string, value: number, label: string, sub: string, colour: string): string {
  return `
    <td width="33%" valign="top" style="padding:6px;">
      <div style="border:1px solid #e4e4e7;border-radius:8px;padding:16px 12px;text-align:center;background:#fafafa;">
        <div style="font-size:22px;line-height:1;margin-bottom:8px;">${icon}</div>
        <div style="font-size:34px;line-height:1;font-weight:700;color:${colour};">${value}</div>
        <div style="margin-top:8px;font-size:13px;font-weight:600;color:#333;">${esc(label)}</div>
        <div style="margin-top:4px;font-size:12px;color:#777;">${esc(sub)}</div>
      </div>
    </td>`;
}

function formatZaDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export interface WeeklyUpdateEmail {
  teamName: string;
  weekOf: string; // YYYY-MM-DD
  facts: import("@/lib/weeklyUpdate").WeeklyFacts;
  /** This recipient is still on their temporary password. */
  notActivated: boolean;
  /** May see every spend application in the portal (view_all_spend). The
   *  spend block is left out entirely for everyone else. */
  seesSpend: boolean;
  /** Sent from "Send a preview to me": says so at the top. */
  preview?: boolean;
}

/** Pure: builds the subject and HTML, so a script can render it with no
 *  store and no mail provider. */
export function buildWeeklyUpdateEmail(
  b: SchoolBranding,
  to: string,
  recipientName: string,
  e: WeeklyUpdateEmail
): { subject: string; html: string } {
  const PRIMARY = b.colors.primary;
  const RED = "#dc2626";
  const { actions, accounts, minutes } = e.facts;
  const waitingSignatures = minutes.reduce((n, m) => n + m.waitingOn.length, 0);

  const actionSub =
    actions.overdue > 0
      ? `${actions.overdue} overdue`
      : actions.dueThisWeek > 0
        ? `${actions.dueThisWeek} due this week`
        : "none overdue";

  const cards = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 8px;border-collapse:collapse;">
      <tr>
        ${weeklyCard(WEEKLY_ICONS.actions, actions.open, "Open action items", actionSub, actions.overdue > 0 ? RED : PRIMARY)}
        ${weeklyCard(WEEKLY_ICONS.notSignedIn, accounts.notActivated, "Not yet signed in", `of ${accounts.total} portal users`, PRIMARY)}
        ${weeklyCard(WEEKLY_ICONS.minutes, minutes.length, "Minutes to sign", minutes.length ? `${waitingSignatures} signature${waitingSignatures === 1 ? "" : "s"} outstanding` : "all signed", PRIMARY)}
      </tr>
    </table>`;

  const heading = (text: string) =>
    `<h3 style="color:${b.colors.dark};font-size:16px;margin:24px 0 8px;">${esc(text)}</h3>`;

  const overdueBlock = actions.overdueList.length
    ? `${heading("Overdue action items")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        ${actions.overdueList
          .slice(0, WEEKLY_LIST_CAP)
          .map(
            (a) => `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;color:#333;"><strong>${esc(a.ref)}</strong> ${esc(a.title)}<br><span style="color:#777;font-size:13px;">${esc(a.owners)}</span></td>
          <td style="padding:8px 0 8px 12px;border-bottom:1px solid #eee;color:${RED};white-space:nowrap;text-align:right;" valign="top">${a.daysLate} day${a.daysLate === 1 ? "" : "s"} late</td>
        </tr>`
          )
          .join("")}
      </table>
      ${actions.overdueList.length > WEEKLY_LIST_CAP ? `<p style="color:#777;font-size:13px;margin:8px 0 0;">And ${actions.overdueList.length - WEEKLY_LIST_CAP} more in the portal.</p>` : ""}`
    : "";

  const minutesBlock = minutes.length
    ? `${heading("Minutes waiting for signatures")}
      ${minutes
        .slice(0, WEEKLY_LIST_CAP)
        .map(
          (m) => `<div style="background:#f4f4f5;padding:12px 14px;border-radius:6px;margin:0 0 8px;font-size:14px;">
        <p style="margin:0;color:#333;"><strong>${esc(m.title)}</strong> <span style="color:#777;">(${esc(m.period)})</span></p>
        <p style="margin:6px 0 0;color:#333;">${m.signed} of ${m.total} signed. Waiting on: <strong>${esc(m.waitingOn.join(", ") || "nobody")}</strong></p>
      </div>`
        )
        .join("")}
      ${minutes.length > WEEKLY_LIST_CAP ? `<p style="color:#777;font-size:13px;margin:8px 0 0;">And ${minutes.length - WEEKLY_LIST_CAP} more in the portal.</p>` : ""}`
    : "";

  const spend = e.facts.spend;
  const rands = (n: number) => `R${Math.round(n).toLocaleString("en-ZA")}`;
  const spendBlock = e.seesSpend
    ? `${heading("Spend and projects")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 8px;border-collapse:collapse;">
        <tr>
          ${weeklyCard(WEEKLY_ICONS.awaiting, spend.awaiting, "Awaiting approval", spend.awaiting ? rands(spend.awaitingValue) : "nothing waiting", PRIMARY)}
          ${weeklyCard(WEEKLY_ICONS.approved, spend.approved, "Approved", spend.approved ? `${rands(spend.approvedValue)} in progress` : "none in progress", PRIMARY)}
          ${weeklyCard(WEEKLY_ICONS.sentBack, spend.changes, "Sent back for changes", `${spend.completed} project${spend.completed === 1 ? "" : "s"} completed`, spend.changes > 0 ? "#d97706" : PRIMARY)}
        </tr>
      </table>
      ${spend.awaitingList.length
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin-top:8px;">
        ${spend.awaitingList
          .slice(0, WEEKLY_LIST_CAP)
          .map(
            (s) => `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;color:#333;"><strong>${esc(s.project)}</strong><br><span style="color:#777;font-size:13px;">${
            s.noApprovers
              ? `<span style="color:${RED};">No approvers set, so this cannot move</span>`
              : `${s.approved} of ${s.total} approved. Waiting on: ${esc(s.waitingOn.join(", ") || "nobody")}`
          }</span></td>
          <td style="padding:8px 0 8px 12px;border-bottom:1px solid #eee;color:#333;white-space:nowrap;text-align:right;" valign="top">${rands(s.amount)}</td>
        </tr>`
          )
          .join("")}
      </table>
      ${spend.awaitingList.length > WEEKLY_LIST_CAP ? `<p style="color:#777;font-size:13px;margin:8px 0 0;">And ${spend.awaitingList.length - WEEKLY_LIST_CAP} more in the portal.</p>` : ""}`
        : ""}`
    : "";

  const activateBlock = e.notActivated
    ? `<div style="border:1px solid ${PRIMARY};border-radius:8px;padding:14px 16px;margin:20px 0 0;">
        <p style="margin:0;color:#333;font-size:14px;"><strong>You have not signed in yet.</strong> Your account is ready. If you no longer have your temporary password, set a new one here:</p>
        <a href="${SITE_URL}/forgot-password" style="display:inline-block;margin-top:10px;color:${PRIMARY};font-weight:600;">Set my password</a>
      </div>`
    : "";

  const body = `
    ${e.preview ? `<p style="background:#fef3c7;color:#92400e;padding:8px 12px;border-radius:6px;font-size:13px;margin:0 0 16px;">Preview. Only you received this copy.</p>` : ""}
    <p style="color:#333;margin:0;">Here's your weekly SGB update for the week of ${esc(formatZaDate(e.weekOf))}.</p>
    ${cards}
    ${overdueBlock}
    ${minutesBlock}
    ${spendBlock}
    ${activateBlock}
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${SITE_URL}" style="display:inline-block;background:${PRIMARY};color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;">Open the ${esc(b.shortName)} portal</a>
      <p style="margin:10px 0 0;font-size:12px;color:#777;">${esc(SITE_URL.replace(/^https?:\/\//, ""))}</p>
    </div>
    <p style="color:#999;font-size:12px;margin:24px 0 0;">You receive this because you have an account on the ${esc(b.fullName)} ${esc(b.tagline)}. Sent to ${esc(recipientName || to)}.</p>
  `;

  const subjectBits = [
    `${actions.open} open action${actions.open === 1 ? "" : "s"}`,
    ...(minutes.length ? [`${minutes.length} set${minutes.length === 1 ? "" : "s"} of minutes to sign`] : []),
    ...(e.seesSpend && spend.awaiting ? [`${spend.awaiting} project${spend.awaiting === 1 ? "" : "s"} awaiting approval`] : []),
  ];
  const subject = `${e.preview ? "[Preview] " : ""}${b.shortName} weekly SGB update: ${subjectBits.join(", ")}`;

  return { subject, html: emailShell(b, `Good day, ${esc(e.teamName)} team.`, body) };
}

export async function sendWeeklyUpdateEmail(
  to: string,
  recipientName: string,
  e: WeeklyUpdateEmail
): Promise<boolean> {
  const b = await resolveBranding();
  const { subject, html } = buildWeeklyUpdateEmail(b, to, recipientName, e);
  return sendEmail(b.fromEmail, to, subject, html, b.replyTo);
}
