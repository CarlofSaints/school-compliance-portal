import { formatMeetingDate } from "./minutes";
import { Resend } from "resend";
import { resolveBranding } from "@/lib/brandingData";
import type { SchoolBranding } from "@/lib/branding";
import { requestHostname, tenantScope } from "@/lib/tenantContext";
import { getTenantByKey, resolveTenantForHost } from "@/lib/tenantRegistry";
import { duePhrase } from "@/lib/actionItems";
import { readableTextOn } from "@/lib/brandingColors";
import { recordSentEmail, type EmailMeta } from "@/lib/sentEmails";
import { esc } from "@/lib/escapeHtml";
import { afterResponse } from "@/lib/activityActor";

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

// 🔴 On the SHARED deployment SITE_URL is one address for every school, so a
// link built from it lands on a host that is not the school's: the reset page
// there could not find its API and said "We could not check that link" (Carl,
// 26 Oct, on the demo school). Each email now links to the school it is FOR.
// A single-school deployment (HVPS, Jeppe) keeps SITE_URL.
async function schoolSiteUrl(): Promise<string> {
  try {
    const scope = await tenantScope();
    if (!scope.fromRegistry) return SITE_URL;
    // Sent during a request on the school's own address: link back to exactly
    // that address, the one the reader has just proven works.
    const host = await requestHostname().catch(() => "");
    if (host && (await resolveTenantForHost(host))?.key === scope.key) return `https://${host}`;
    // Otherwise a school forced with runAsTenant (platform admin, a future
    // per-school cron): the address it was created on. Read fresh, not cached,
    // so a released hostname never gets a reset token mailed to it.
    const first = (await getTenantByKey(scope.key))?.hostnames[0];
    return first ? `https://${first}` : SITE_URL;
  } catch (err) {
    console.error("[email] could not resolve the school's address, links use SITE_URL:", err);
    return SITE_URL;
  }
}

/** Branding plus the address its links point at. `siteUrl` is optional only so
 *  the check scripts can render a builder with no store. */
type MailBranding = SchoolBranding & { siteUrl?: string };
const siteOf = (b: MailBranding) => b.siteUrl || SITE_URL;

async function mailBranding(): Promise<MailBranding> {
  const [b, siteUrl] = await Promise.all([resolveBranding(), schoolSiteUrl()]);
  return { ...b, siteUrl };
}
// Derived per send. These used to be module constants, which meant every
// email carried whichever school the deployment was BUILT for, no matter what
// the school had since set in the portal - and on a shared deployment, no
// matter which school the email was even for.
function logoUrl(b: MailBranding): string {
  // A school with no crest yet gets NO url, and the header block is left out
  // rather than pointed at a default. `${siteOf(b)}` with an empty logo would
  // otherwise resolve to the site root and render as a broken image.
  if (!b.logo) return "";
  // Absolute, because a mail client has no idea what a relative path means.
  // Files under /public and /api/branding/logo are both served without a
  // login, so this resolves for a recipient with no account.
  return b.logo.startsWith("http") ? b.logo : `${siteOf(b)}${b.logo}`;
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
// ---------------------------------------------------------------------------
// 🔴 Built from TABLES with bgcolor, not styled divs. Outlook on Windows draws
// mail with Word, which ignores background colours on divs and links, padding
// on links and rounded corners. Carl, 19 Oct 2026: the header came out white
// with the white school name on it, invisible, and every button was bare text.
// Anything coloured goes on a <td> with both bgcolor and a style background.
// ---------------------------------------------------------------------------

const FONT = "Arial,Helvetica,sans-serif";

/** A button that keeps its colour and size in Outlook: the colour AND the
 *  padding sit on the table cell (Outlook ignores padding on a link), and
 *  the link inside only carries the text. */
function button(href: string, label: string, bg: string, align: "left" | "center" = "left"): string {
  const fg = readableTextOn(bg);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${align === "center" ? ' align="center"' : ""} style="margin:16px 0;"><tr><td bgcolor="${bg}" style="background:${bg};border-radius:6px;padding:12px 24px;"><a href="${href}" style="display:inline-block;font-family:${FONT};font-size:15px;font-weight:bold;color:${fg};text-decoration:none;border-radius:6px;">${label}</a></td></tr></table>`;
}

/** A tinted panel (the minutes title, a project's facts, a comment). Opened
 *  and closed separately because what goes inside is the template's own HTML. */
function boxOpen(bg: string, padding: string, margin: string, extra = ""): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:${margin};"><tr><td bgcolor="${bg}" style="background:${bg};padding:${padding};border-radius:6px;${extra}">`;
}
const BOX_CLOSE = `</td></tr></table>`;

function emailShell(b: MailBranding, title: string, body: string): string {
  const PRIMARY = b.colors.primary;
  // Black or white, whichever reads on the school's colour: HVPS's cyan with
  // white text was hard to read even where the colour did show.
  const HEAD_TEXT = readableTextOn(PRIMARY);
  const STRIPE = b.colors.accent && b.colors.accent.toLowerCase() !== PRIMARY.toLowerCase() ? b.colors.accent : b.colors.primaryDark;
  const LOGO_URL = logoUrl(b);
  const footerSlogan = b.slogan ? `&ldquo;${esc(b.slogan)}&rdquo;` : "";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>body, table, td, p, a, li, h2, div { font-family: Arial, Helvetica, sans-serif; }</style>
</head>
<body style="margin:0;padding:0;background:#f1f3f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f3f5" style="background:#f1f3f5;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">
      <tr>
        <td bgcolor="${PRIMARY}" align="center" style="background:${PRIMARY};padding:28px 24px 22px;border-radius:10px 10px 0 0;font-family:${FONT};">
          ${
            // 🔴 Omitted when a school has no crest, never a default file:
            // the old fallback was Hurlyvale's own crest.
            LOGO_URL
              ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td bgcolor="#ffffff" style="background:#ffffff;padding:8px;border-radius:8px;"><img src="${LOGO_URL}" alt="${esc(b.logoAlt)}" width="56" style="display:block;width:56px;height:auto;border:0;outline:none;text-decoration:none;"></td></tr></table>`
              : ""
          }
          <div style="font-family:${FONT};font-size:22px;font-weight:bold;color:${HEAD_TEXT};margin:${LOGO_URL ? "14px" : "0"} 0 0;">${esc(b.fullName)}</div>
          <div style="font-family:${FONT};font-size:13px;color:${HEAD_TEXT};margin:4px 0 0;">${esc(b.tagline)}</div>
        </td>
      </tr>
      <tr><td bgcolor="${STRIPE}" height="4" style="background:${STRIPE};height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>
      <tr>
        <td bgcolor="#ffffff" style="background:#ffffff;padding:30px 32px 28px;border-radius:0 0 10px 10px;font-family:${FONT};font-size:15px;line-height:1.55;color:#333333;">
          <h2 style="font-family:${FONT};color:${b.colors.dark};font-size:20px;margin:0 0 18px;">${title}</h2>
          ${body}
        </td>
      </tr>
      <tr>
        <td align="center" style="padding:18px 12px 4px;font-family:${FONT};font-size:12px;line-height:1.5;color:#888888;">
          <strong style="color:#666666;">${esc(b.fullName)}</strong>${footerSlogan ? `<br>${footerSlogan}` : ""}
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export async function sendWelcomeEmail(
  to: string,
  name: string,
  password: string
): Promise<boolean> {
  const b = await mailBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const body = `
    <p style="color:#333;">Dear ${esc(name)},</p>
    <p style="color:#333;">Welcome to the ${esc(branding.shortName)} ${esc(branding.tagline)}. Your account has been created.</p>
    ${boxOpen("#f4f4f5", "16px", "16px 0")}
      <p style="margin:0;color:#333;"><strong>Email:</strong> ${esc(to)}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Temporary Password:</strong> ${esc(password)}</p>
    ${BOX_CLOSE}
    <p style="color:#333;">Please log in and change your password immediately.</p>
    ${button(`${siteOf(b)}/login`, `Log In Now`, PRIMARY)}
  `;
  return sendEmail(b.fromEmail, to, `Welcome to ${branding.shortName} ${branding.portalSubtitle}`, emailShell(b, "Welcome!", body), b.replyTo, undefined, undefined, { kind: "account.welcome", secrets: [password] });
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
  const b = await mailBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const url = `${siteOf(b)}/reset-password?token=${encodeURIComponent(token)}`;
  const body = `
    <p style="color:#333;">Dear ${esc(name)},</p>
    <p style="color:#333;">An account has been created for you on the ${esc(branding.shortName)} ${esc(branding.tagline)}. To get in, choose your own password using the button below.</p>
    ${boxOpen("#f4f4f5", "16px", "16px 0")}
      <p style="margin:0;color:#333;"><strong>You sign in with:</strong> ${esc(to)}</p>
    ${BOX_CLOSE}
    ${button(`${url}`, `Choose your password`, PRIMARY)}
    <p style="color:#666;font-size:13px;">This link works once and expires in ${ttlMinutes} minutes. If it has expired by the time you get to it, use <strong>Forgot your password?</strong> on the sign-in page and it will send you a fresh one.</p>
  `;
  return sendEmail(b.fromEmail, to, `Set up your ${branding.shortName} ${branding.portalSubtitle} account`, emailShell(b, "Set up your account", body), b.replyTo, undefined, undefined, { kind: "account.setup" });
}

export async function sendPasswordResetLinkEmail(
  to: string,
  name: string,
  token: string,
  ttlMinutes: number
): Promise<boolean> {
  const b = await mailBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const url = `${siteOf(b)}/reset-password?token=${encodeURIComponent(token)}`;
  const body = `
    <p style="color:#333;">Dear ${esc(name)},</p>
    <p style="color:#333;">Someone asked to reset the password for your ${esc(branding.shortName)} ${esc(branding.tagline)} account. If that was you, choose a new password using the button below.</p>
    ${button(`${url}`, `Choose a new password`, PRIMARY)}
    <p style="color:#666;font-size:13px;">This link works once and expires in ${ttlMinutes} minutes.</p>
    <p style="color:#666;font-size:13px;">If you did not ask for this, you can ignore this email. Your password has not changed.</p>
    <p style="color:#888;font-size:12px;word-break:break-all;">If the button does not work, paste this into your browser:<br>${url}</p>
  `;
  return sendEmail(b.fromEmail, to, `Reset your ${branding.shortName} ${branding.portalSubtitle} password`, emailShell(b, "Reset your password", body), b.replyTo, undefined, undefined, { kind: "account.password_reset" });
}

// Sent to the NEW address when somebody changes their own email. Nothing
// changes until the link is used, which proves they receive mail there (see
// lib/emailChange.ts). The page behind the link asks for a click rather than
// acting on arrival, because mail scanners open links on their own.
export async function sendEmailChangeConfirmEmail(
  to: string,
  name: string,
  token: string,
  ttlHours: number
): Promise<boolean> {
  const b = await mailBranding();
  const PRIMARY = b.colors.primary;
  const url = `${siteOf(b)}/confirm-email?token=${encodeURIComponent(token)}`;
  const body = `
    <p style="color:#333;">Dear ${esc(name)},</p>
    <p style="color:#333;">You asked to use this address for your ${esc(b.shortName)} ${esc(b.tagline)} account. Confirm it using the button below and it becomes the address you sign in with.</p>
    ${button(`${url}`, `Confirm my new email`, PRIMARY)}
    <p style="color:#666;font-size:13px;">This link expires in ${ttlHours} hours. Until it is used, your account keeps its old address.</p>
    <p style="color:#666;font-size:13px;">If you did not ask for this, ignore this email and nothing changes.</p>
  `;
  return sendEmail(b.fromEmail, to, `Confirm your new email for ${b.shortName} ${b.portalSubtitle}`, emailShell(b, "Confirm your new email", body), b.replyTo, undefined, undefined, { kind: "account.email_confirm" });
}

// Sent to the OLD address, both when a change is asked for and when it goes
// through. If somebody else is in the account, this is how the real owner
// finds out while it can still be stopped.
export async function sendEmailChangeNoticeEmail(
  to: string,
  name: string,
  newEmail: string,
  stage: "requested" | "changed"
): Promise<boolean> {
  const b = await mailBranding();
  const what =
    stage === "requested"
      ? `Someone signed in to your account asked to change its email address to <strong>${esc(newEmail)}</strong>. It changes only if that address confirms it.`
      : `The email address on your account has been changed to <strong>${esc(newEmail)}</strong>. From now on you sign in with that address.`;
  const body = `
    <p style="color:#333;">Dear ${esc(name)},</p>
    <p style="color:#333;">${what}</p>
    <p style="color:#333;">If this was not you, contact your school's portal administrator straight away and change your password.</p>
  `;
  return sendEmail(
    b.fromEmail,
    to,
    stage === "requested" ? `Email change requested on ${b.shortName} ${b.portalSubtitle}` : `Your ${b.shortName} ${b.portalSubtitle} email was changed`,
    emailShell(b, stage === "requested" ? "Email change requested" : "Your email was changed", body),
    b.replyTo
  , undefined, undefined, { kind: "account.email_changed" });
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
  const b = await mailBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const url = `${siteOf(b)}/minutes/${minutesId}`;
  const body = `
    <p style="color:#333;">Dear ${esc(recipientName)},</p>
    <p style="color:#333;">${esc(fromName)} has sent you <strong>draft ${draftNumber}</strong> of the minutes below to check.</p>
    ${boxOpen("#f4f4f5", "16px", "16px 0")}
      <p style="margin:0;color:#333;"><strong>${esc(minutesTitle)}</strong></p>
      <p style="margin:6px 0 0;color:#555;font-size:14px;">${esc(periodLabel)}</p>
    ${BOX_CLOSE}
    <p style="color:#333;">Please read it and either approve it, or send it back with a note saying what needs changing.</p>
    ${button(`${url}`, `Read and respond`, PRIMARY)}
  `;
  return sendEmail(
    b.fromEmail,
    to,
    `Please check: ${minutesTitle}`,
    emailShell(b, "Minutes to check", body),
    b.replyTo
  , undefined, undefined, { kind: "minutes.for_checking", minutesId });
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
  const b = await mailBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const url = `${siteOf(b)}/minutes/${minutesId}`;
  const body = `
    <p style="color:#333;">Dear ${esc(secretaryName)},</p>
    <p style="color:#333;"><strong>${esc(reviewerName)}</strong> has asked for changes to <strong>${esc(minutesTitle)}</strong> before it goes out for signing.</p>
    ${
      comments
        ? `${boxOpen("#fffbeb", "12px 16px", "16px 0", "border-left:3px solid #f59e0b;")}<p style="margin:0;color:#78350f;white-space:pre-wrap;">${esc(comments)}</p>${BOX_CLOSE}`
        : `<p style="color:#666;font-size:14px;">No note was left, so it is worth asking them what needs changing.</p>`
    }
    ${button(`${url}`, `Open the minutes`, PRIMARY)}
  `;
  return sendEmail(
    b.fromEmail,
    to,
    `Changes requested: ${minutesTitle}`,
    emailShell(b, "Changes requested", body),
    b.replyTo
  , undefined, undefined, { kind: "minutes.changes_requested", minutesId });
}

// Everyone has approved and it is ready to sign.
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
  const b = await mailBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  // Straight to the document with the signature pad on it, not the summary
  // page: the link in a "please sign" email should open the thing to sign.
  const url = `${siteOf(b)}/minutes/${minutesId}/sign`;
  const body = `
    <p style="color:#333;">Dear ${esc(recipientName)},</p>
    <p style="color:#333;">The minutes below have been checked and are ready for your signature.</p>
    ${boxOpen("#f4f4f5", "16px", "16px 0")}
      <p style="margin:0;color:#333;"><strong>${esc(minutesTitle)}</strong></p>
      <p style="margin:6px 0 0;color:#555;font-size:14px;">${esc(periodLabel)}</p>
    ${BOX_CLOSE}
    <p style="color:#333;">Read them through, then sign with this code:</p>
    ${boxOpen("#f4f4f5", "14px 20px", "8px 0 20px", "text-align:center;")}<span style="font-family:'Courier New',monospace;font-size:30px;letter-spacing:8px;font-weight:bold;color:${b.colors.dark};">${esc(code)}</span>${BOX_CLOSE}
    ${button(`${url}`, `Read and sign`, PRIMARY)}
    <p style="color:#666;font-size:13px;margin-top:20px;">The code is yours alone. Do not pass it on: whoever uses it signs in your name.</p>
    <p style="color:#666;font-size:13px;">Once everyone has signed, the minutes are locked and cannot be changed. If something is still wrong, ask the secretary to pull them back rather than signing.</p>
  `;
  return sendEmail(
    b.fromEmail,
    to,
    `Your signing code: ${minutesTitle}`,
    emailShell(b, "Ready to sign", body),
    b.replyTo
  , undefined, undefined, { kind: "minutes.signing_code", minutesId, secrets: [code] });
}

// Everybody has signed. This goes to the distribution list for the body, so
// the whole SGB or FINCOM gets the final record.
/** An open action from the minutes that is this recipient's to do. */
export interface SignedEmailAction {
  title: string;
  dueDate?: string;
}

// Carl's wording, 19 Oct 2026. Each recipient sees only THEIR open actions
// from this meeting, so the list is a to-do, not the whole register.
export async function sendMinutesSignedEmail(
  to: string,
  recipientName: string,
  minutesId: string,
  minutesTitle: string,
  periodLabel: string,
  /** "on 15 October 2026" / "in October 2026" (meetingWhen in lib/minutes). */
  heldWhen: string,
  signedBy: string[],
  /** Identifies the exact wording signed (shortHash of documentHash). */
  documentRef: string,
  actions: SignedEmailAction[],
  /** Has a portal login. Only then is the Action Item List mentioned: a
   *  register member without one would land on a sign-in page. */
  canSignIn: boolean,
  /** The signed minutes themselves. Absent when the file could not be built,
   *  in which case the email still goes, with its link. */
  attachment?: EmailAttachment | null
): Promise<boolean> {
  const b = await mailBranding();
  const PRIMARY = b.colors.primary;
  const url = `${siteOf(b)}/minutes/${minutesId}`;
  const actionBlock = actions.length
    ? `
    <p style="color:#333;margin-top:20px;">Action items from the meeting that are yours to execute are:</p>
    <ol style="color:#333;margin:0 0 12px;padding-left:22px;">
      ${actions
        .map(
          (a) =>
            `<li style="margin:0 0 6px;">${esc(a.title)}${a.dueDate ? ` <span style="color:#666;font-size:13px;">(due ${esc(formatZaDate(a.dueDate))})</span>` : ""}</li>`
        )
        .join("")}
    </ol>${
      canSignIn
        ? `
    <p style="color:#333;">Remember to check the <a href="${siteOf(b)}/action-items" style="color:${b.colors.dark};font-weight:bold;">Action Item List</a> in the portal and then mark as done the ones you have completed.</p>`
        : ""
    }`
    : "";
  // Two bodies: if the attachment is refused the mail goes without it, and
  // must not then say a copy is attached.
  const body = (attached: boolean) => `
    <p style="color:#333;">Dear ${esc(recipientName)},</p>
    <p style="color:#333;">Minutes from the meeting held ${esc(heldWhen)} ${attached ? "are attached for your reference" : "have been signed"}.</p>
    <p style="color:#333;margin-bottom:0;">You can view them online if you would like, by clicking this link:</p>
    ${button(url, "READ", PRIMARY)}
    ${actionBlock}
    ${boxOpen("#f4f4f5", "16px", "20px 0 16px")}
      <p style="margin:0;color:#333;">Minutes Name: <strong>${esc(minutesTitle)}</strong></p>
      <p style="margin:6px 0 0;color:#555;font-size:14px;">${esc(periodLabel)}</p>
      <p style="margin:10px 0 0;color:#555;font-size:14px;">Signed by ${esc(signedBy.join(", "))}</p>
    ${BOX_CLOSE}
    <p style="color:#333;">Thank you</p>
    <p style="color:#999;font-size:12px;margin-top:24px;">Document reference ${esc(documentRef)}. It identifies the exact wording that was signed, so a later copy can be checked against it.</p>
  `;
  return sendEmail(
    b.fromEmail,
    to,
    `Signed: ${minutesTitle}`,
    emailShell(b, "Signed minutes", body(!!attachment)),
    b.replyTo,
    attachment ? [attachment] : undefined,
    attachment ? emailShell(b, "Signed minutes", body(false)) : undefined
  , { kind: "minutes.signed", minutesId });
}

export async function sendSpendNotificationEmail(
  to: string,
  recipientName: string,
  projectName: string,
  amount: number,
  submittedBy: string
): Promise<boolean> {
  const b = await mailBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const body = `
    <p style="color:#333;">Dear ${esc(recipientName)},</p>
    <p style="color:#333;">A new spend application has been submitted and requires your review.</p>
    ${boxOpen("#f4f4f5", "16px", "16px 0")}
      <p style="margin:0;color:#333;"><strong>Project:</strong> ${esc(projectName)}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Amount:</strong> R${amount.toLocaleString()}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Submitted by:</strong> ${esc(submittedBy)}</p>
    ${BOX_CLOSE}
    ${button(`${siteOf(b)}/spend`, `Review Application`, PRIMARY)}
  `;
  return sendEmail(b.fromEmail, to, `Spend Application: ${projectName}`, emailShell(b, "New Spend Application", body), b.replyTo, undefined, undefined, { kind: "spend.new_application" });
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
  const b = await mailBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const intro = submitterName
    ? `${esc(submitterName)} has submitted an application for school funds spend on your behalf for: <strong>"${esc(projectName)}"</strong>`
    : `Your application for school funds spend has been received for: <strong>"${esc(projectName)}"</strong>`;

  // No approvers means the amount fell in a logged-only band. Saying "sent to:"
  // with an empty list would read as though the mail had gone nowhere.
  const routing = approverNames.length
    ? `<p style="color:#333;">It has been sent for approval to: ${esc(approverNames.join(", "))}.</p>`
    : `<p style="color:#333;">This amount does not require approval, so the application has been logged and approved automatically.</p>`;

  const quotes = quoteCount
    ? `<p style="color:#333;">${quoteCount} quote${quoteCount !== 1 ? "s were" : " was"} submitted with it.</p>`
    : "";

  const body = `
    <p style="color:#333;">Dear ${esc(applicantName)},</p>
    <p style="color:#333;">${intro}</p>
    ${quotes}
    ${routing}
    ${button(`${siteOf(b)}/spend`, `View Application`, PRIMARY)}
  `;
  return sendEmail(b.fromEmail, 
    to,
    `Spend Application Submitted: ${projectName}`,
    emailShell(b, "Application Submitted", body)
  , b.replyTo, undefined, undefined, { kind: "spend.applicant_confirmation" });
}

/** A file sent with an email. Resend's limit is 40MB for the whole message
 *  after encoding; a set of minutes, or a scan capped at 15MB on upload, fits. */
export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

/**
 * Sends one email AND records it in the sent box (lib/sentEmails). The record
 * is started right after the send (so it carries the send time and a long
 * mailout writes as it goes, not all at the end), kept alive past the
 * response by after(), and can never fail the send.
 */
async function sendEmail(
  from: string,
  to: string,
  subject: string,
  html: string,
  replyTo?: string,
  attachments?: EmailAttachment[],
  /** The body to send instead if the message has to go without its
   *  attachments, so it does not promise a file that is not there. */
  htmlWithoutAttachments?: string,
  // Fails CLOSED: a send that forgets its meta keeps neither subject nor body.
  meta: EmailMeta = { kind: "other", personal: true }
): Promise<boolean> {
  const r = await deliver(from, to, subject, html, replyTo, attachments, htmlWithoutAttachments);
  // Started now, not awaited here: a send loop never waits on the sent box.
  // afterResponse keeps it alive past the response (scripts await it through
  // flushAfterResponse).
  const recording = recordSentEmail(
      {
        to,
        // A personal mail's subject names its private content ("Action A-001:
        // <title>"), so it is withheld with the body.
        subject: meta.personal ? "" : subject,
        kind: meta.kind,
        ...(meta.minutesId ? { minutesId: meta.minutesId } : {}),
        // Not configured counts as not sent here, though the caller is told true.
        ok: r.ok && !r.error,
        ...(r.error ? { error: r.error } : {}),
        ...(r.attached.length ? { attachments: r.attached } : {}),
      },
      meta.personal ? undefined : r.html,
      meta.secrets
    );
  await afterResponse(() => recording);
  return r.ok;
}

async function deliver(
  from: string,
  to: string,
  subject: string,
  html: string,
  replyTo?: string,
  attachments?: EmailAttachment[],
  htmlWithoutAttachments?: string
): Promise<{ ok: boolean; error?: string; html: string; attached: string[] }> {
  const names = (attachments ?? []).map((a) => a.filename);
  if (!resend) {
    console.log(`[Email] Would send to ${to}: ${subject}`);
    if (attachments?.length) {
      console.log(`[Email] With ${attachments.map((a) => `${a.filename} (${a.content.length} bytes)`).join(", ")}`);
    }
    console.log(`[Email] (No RESEND_API_KEY configured)`);
    // True to the caller as before (a deployment without email must still
    // work), but the sent box says plainly that nothing left.
    return { ok: true, error: "Not sent: email is not set up on this deployment.", html, attached: names };
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
    let sent = { html, attached: names };

    // A refused attachment must not cost the email itself. Signed minutes that
    // arrive with only their link beat signed minutes that never arrive.
    if (error && attachments?.length) {
      console.error(
        `[Email] Rejected with attachment to ${to}, retrying without it:`,
        error
      );
      const bare = htmlWithoutAttachments ?? html;
      ({ error } = await resend.emails.send({ ...message, html: bare }));
      sent = { html: bare, attached: [] };
    }

    if (error) {
      console.error(`[Email] Resend refused the message to ${to}:`, error);
      return { ok: false, error: error.message || String(error), ...sent };
    }
    return { ok: true, ...sent };
  } catch (err) {
    console.error("[Email] Failed to send:", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err), html, attached: [] };
  }
}

// ---------------------------------------------------------------------------
// Translation credits bought by EFT (lib/creditRequests.ts).
// ---------------------------------------------------------------------------

/** Who receives credit orders. One address, School Compliance's, never the school's. */
export function creditOrdersTo(): string {
  return process.env.CREDITS_ORDER_EMAIL || "carl@outerjoin.co.za";
}

const rand = (n: number) => `R${n.toLocaleString("en-ZA")}`;

/** To School Compliance: invoice this, and press the button once it is paid.
 *  The button is the only copy of the approve link. */
export async function sendCreditOrderEmail(order: {
  credits: number;
  amountRand: number;
  reference: string;
  requestedBy: { name: string; email: string };
  approveUrl: string;
}): Promise<boolean> {
  const b = await mailBranding();
  const body = `
    <p style="color:#333;"><strong>${esc(b.fullName)}</strong> asked for <strong>${order.credits} translation credits</strong> (${rand(order.amountRand)}).</p>
    <p style="color:#333;">Requested by ${esc(order.requestedBy.name)} &lt;${esc(order.requestedBy.email)}&gt;.${
      order.reference ? `<br>PO / reference: <strong>${esc(order.reference)}</strong>` : ""
    }</p>
    <p style="color:#b45309;font-weight:bold;">Nothing has been paid and no credits have been added. Send the invoice; press the button only once the EFT is in.</p>
    ${button(`${order.approveUrl}`, `Payment received: add ${order.credits} credits`, b.colors.primary)}
    <p style="color:#666;font-size:13px;">The link works once and expires in 90 days. Do not forward this email: whoever has the link can add the credits.</p>
  `;
  return sendEmail(
    b.fromEmail,
    creditOrdersTo(),
    `Credit order: ${b.shortName}, ${order.credits} credits (${rand(order.amountRand)}), to invoice`,
    emailShell(b, "Translation credits to invoice", body),
    order.requestedBy.email
  , undefined, undefined, { kind: "credits.order" });
}

/** To the person who asked: what happens next. Says "to pay", never "paid". */
export async function sendCreditOrderConfirmationEmail(
  to: string,
  name: string,
  order: { credits: number; amountRand: number; reference: string }
): Promise<boolean> {
  const b = await mailBranding();
  const body = `
    <p style="color:#333;">Dear ${esc(name)},</p>
    <p style="color:#333;">Thank you. We have your request for <strong>${order.credits} translation credits</strong>, ${rand(order.amountRand)} to pay.${
      order.reference ? ` Your reference: <strong>${esc(order.reference)}</strong>.` : ""
    }</p>
    <p style="color:#333;">An invoice will follow by email. Pay it by EFT and the credits are added to your school's balance as soon as the payment comes in. You will get an email when they are.</p>
    <p style="color:#666;font-size:13px;">Nothing has been charged. Credits never expire.</p>
  `;
  return sendEmail(b.fromEmail, to, `Your translation credits request (${rand(order.amountRand)})`, emailShell(b, "Translation credits requested", body), b.replyTo, undefined, undefined, { kind: "credits.order_confirmation" });
}

/** To School Compliance: suspended 90 days, the Terms say delete (lib/schoolRetention.ts). */
export async function sendSchoolsDueForDeletionEmail(
  schools: { key: string; name: string; suspendedAt?: string }[],
  origin: string
): Promise<boolean> {
  const b = await mailBranding();
  const rows = schools
    .map(
      (s) =>
        `<li style="color:#333;margin-bottom:6px;"><a href="${esc(`${origin}/platform/${s.key}`)}">${esc(s.name)}</a> (${esc(s.key)}), suspended ${esc((s.suspendedAt || "").slice(0, 10))}</li>`
    )
    .join("");
  const body = `
    <p style="color:#333;">These schools have been suspended for 90 days. Our Terms and refund policy promise to delete their data now.</p>
    <ul>${rows}</ul>
    <p style="color:#333;">Open each one, check nobody asked for a copy or is coming back, then delete it there. If they are coming back, reactivate them instead.</p>
    <p style="color:#666;font-size:13px;">Nothing has been deleted. You get this again each week until each school is deleted or reactivated.</p>
  `;
  return sendEmail(
    b.fromEmail,
    creditOrdersTo(),
    `${schools.length} school${schools.length === 1 ? "" : "s"} due for deletion`,
    emailShell(b, "Schools due for deletion", body),
    b.replyTo,
    undefined,
    undefined,
    { kind: "platform.deletion_due" }
  );
}

// ---------------------------------------------------------------------------
// Bug reports and feature requests (lib/feedback.ts).
// ---------------------------------------------------------------------------

/** To School Compliance: the whole report. Reply goes straight to the person. */
export async function sendFeedbackEmail(fb: import("@/lib/feedback").Feedback, pageUrl: string): Promise<boolean> {
  const { KIND_LABELS } = await import("@/lib/feedback");
  const b = await mailBranding();
  const body = `
    <p style="color:#333;"><strong>${esc(KIND_LABELS[fb.kind])}</strong> ${fb.ticket} from <strong>${esc(b.fullName)}</strong>.</p>
    <p style="color:#333;">From ${esc(fb.from.name)} &lt;${esc(fb.from.email)}&gt;${pageUrl ? `, on <a href="${esc(pageUrl)}">${esc(fb.page)}</a>` : ""}.</p>
    <p style="color:#333;font-size:16px;"><strong>${esc(fb.summary)}</strong></p>
    <p style="color:#333;white-space:pre-wrap;">${esc(fb.detail)}</p>
    <p style="color:#666;font-size:13px;">Reply to this email to answer ${esc(fb.from.name)} directly.</p>
  `;
  return sendEmail(
    b.fromEmail,
    creditOrdersTo(),
    `${KIND_LABELS[fb.kind]} ${fb.ticket}: ${b.shortName}: ${fb.summary}`,
    emailShell(b, KIND_LABELS[fb.kind], body),
    fb.from.email
  , undefined, undefined, { kind: `feedback.${fb.kind}` });
}

/** To the person who sent it: the ticket number to quote. */
export async function sendFeedbackConfirmationEmail(fb: import("@/lib/feedback").Feedback): Promise<boolean> {
  const b = await mailBranding();
  const what = fb.kind === "bug" ? "bug report" : "feature request";
  const body = `
    <p style="color:#333;">Dear ${esc(fb.from.name)},</p>
    <p style="color:#333;">Thank you. We have your ${what}, ticket number <strong>${fb.ticket}</strong>:</p>
    <p style="color:#333;"><strong>${esc(fb.summary)}</strong></p>
    <p style="color:#333;">We read every one. If we need more detail we will reply to this address. Quote ${fb.ticket} if you write to us about it.</p>
  `;
  return sendEmail(b.fromEmail, fb.from.email, `Your ${what}: ticket ${fb.ticket}`, emailShell(b, `Ticket ${fb.ticket}`, body), b.replyTo, undefined, undefined, { kind: "feedback.confirmation" });
}

/** To the person who asked, once the credits are on. */
export async function sendCreditsAddedEmail(
  to: string,
  name: string,
  credits: number,
  balance: number
): Promise<boolean> {
  const b = await mailBranding();
  const body = `
    <p style="color:#333;">Dear ${esc(name)},</p>
    <p style="color:#333;">Your payment has been received and <strong>${credits} translation credits</strong> have been added. Your school now has <strong>${balance}</strong> credits.</p>
    <p style="color:#666;font-size:13px;">Choose a language at the top right of the portal, then use "Translate" on a policy or set of minutes.</p>
  `;
  return sendEmail(b.fromEmail, to, `${credits} translation credits added`, emailShell(b, "Translation credits added", body), b.replyTo, undefined, undefined, { kind: "credits.added" });
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
  const b = await mailBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const noteBlock = note
    ? `<p style="color:#333;">${esc(note)}</p>`
    : `<p style="color:#333;">This is a scheduled reminder about the project below.</p>`;
  const body = `
    <p style="color:#333;">Dear ${esc(recipientName)},</p>
    ${noteBlock}
    ${boxOpen("#f4f4f5", "16px", "16px 0")}
      <p style="margin:0;color:#333;"><strong>Project:</strong> ${esc(projectName)}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Amount:</strong> R${amount.toLocaleString()}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Status:</strong> ${esc(statusLabel)}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>You are receiving this as:</strong> ${esc(role)}</p>
    ${BOX_CLOSE}
    ${button(`${siteOf(b)}/spend`, `Open the Project`, PRIMARY)}
  `;
  return sendEmail(b.fromEmail, 
    to,
    `Reminder: ${projectName}`,
    emailShell(b, "Project Reminder", body)
  , b.replyTo, undefined, undefined, { kind: "spend.reminder" });
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
  const b = await mailBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const url = `${siteOf(b)}/spend/${spendId}`;
  const deadline = requiredBy
    ? `<p style="margin:8px 0 0;color:#333;"><strong>Approval required by:</strong> ${esc(requiredBy)}</p>`
    : "";
  const body = `
    <p style="color:#333;">Dear ${esc(approverName)},</p>
    <p style="color:#333;">A fund application needs your decision.</p>
    ${boxOpen("#f4f4f5", "16px", "16px 0")}
      <p style="margin:0;color:#333;"><strong>Project:</strong> ${esc(projectName)}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Suggested source of funds:</strong> ${esc(sourceOfFunds || "Not stated")}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Quotes submitted:</strong> ${quoteCount}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Estimated cost:</strong> R${amount.toLocaleString()}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Submitted by:</strong> ${esc(submittedBy)}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Approval level:</strong> ${esc(tierLabel)}</p>
      ${deadline}
    ${BOX_CLOSE}
    <p style="color:#333;">Open the application to read it in full, then approve, decline, or ask a question.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:12px;">
      <tr>
        <td style="padding-right:8px;">
          ${button(`${url}?decision=approve`, `Approve`, "#059669")}
        </td>
        <td>
          ${button(`${url}?decision=decline`, `Decline`, "#dc2626")}
        </td>
      </tr>
    </table>
    <p style="color:#888;font-size:12px;margin-top:16px;">Both buttons open the application in the portal, where your decision is recorded against your name.</p>
  `;
  return sendEmail(b.fromEmail, 
    to,
    `Approval needed: ${projectName} (R${amount.toLocaleString()})`,
    emailShell(b, "Fund Application Approval", body)
  , b.replyTo, undefined, undefined, { kind: "spend.approval_request" });
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
  const b = await mailBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const note = comments
    ? `<p style="margin:8px 0 0;color:#333;"><strong>Their comment:</strong> ${esc(comments)}</p>`
    : "";
  const body = `
    <p style="color:#333;">Dear ${esc(applicantName)},</p>
    <p style="color:#333;">There has been an update on your fund application.</p>
    ${boxOpen("#f4f4f5", "16px", "16px 0")}
      <p style="margin:0;color:#333;"><strong>Project:</strong> ${esc(projectName)}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>${esc(approverName)}:</strong> ${esc(decision)}</p>
      ${note}
      <p style="margin:8px 0 0;color:#333;"><strong>Progress:</strong> ${approved} of ${total} approvals in</p>
    ${BOX_CLOSE}
    ${button(`${siteOf(b)}/spend/${spendId}`, `View the Application`, PRIMARY)}
  `;
  return sendEmail(b.fromEmail, 
    to,
    `Update on ${projectName}: ${approved} of ${total} approved`,
    emailShell(b, "Application Update", body)
  , b.replyTo, undefined, undefined, { kind: "spend.approval_progress" });
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
  const b = await mailBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const body = `
    <p style="color:#333;">Dear ${esc(applicantName)},</p>
    <p style="color:#333;">Your fund application has been <strong>fully approved</strong>.</p>
    ${boxOpen("#f4f4f5", "16px", "16px 0")}
      <p style="margin:0;color:#333;"><strong>Project:</strong> ${esc(projectName)}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Approved amount:</strong> R${amount.toLocaleString()}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Approved by:</strong> ${esc(approverNames.join(", "))}</p>
    ${BOX_CLOSE}
    ${button(`${siteOf(b)}/spend/${spendId}`, `View the Application`, PRIMARY)}
  `;
  return sendEmail(b.fromEmail, 
    to,
    `Approved: ${projectName}`,
    emailShell(b, "Application Approved", body)
  , b.replyTo, undefined, undefined, { kind: "spend.fully_approved" });
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
  const b = await mailBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const url = `${siteOf(b)}/spend/${spendId}`;
  const others = stillWaitingOn.filter((n) => n !== approverName);
  const alsoWaiting =
    others.length > 0
      ? `<p style="margin:8px 0 0;color:#333;"><strong>Also still to decide:</strong> ${esc(others.join(", "))}</p>`
      : "";
  const waited =
    waitingDays > 0
      ? `It has been waiting ${waitingDays} day${waitingDays === 1 ? "" : "s"}.`
      : "It was submitted today.";
  const body = `
    <p style="color:#333;">Dear ${esc(approverName)},</p>
    <p style="color:#333;">This is a reminder that a fund application is waiting for your decision. ${waited}</p>
    ${boxOpen("#f4f4f5", "16px", "16px 0")}
      <p style="margin:0;color:#333;"><strong>Project:</strong> ${esc(projectName)}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Suggested source of funds:</strong> ${esc(sourceOfFunds || "Not stated")}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Quotes submitted:</strong> ${quoteCount}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Estimated cost:</strong> R${amount.toLocaleString()}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Reminder sent by:</strong> ${esc(chasedBy)}</p>
      ${alsoWaiting}
    ${BOX_CLOSE}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:12px;">
      <tr>
        <td style="padding-right:8px;">
          ${button(`${url}?decision=approve`, `Approve`, "#059669")}
        </td>
        <td>
          ${button(`${url}?decision=decline`, `Decline`, "#dc2626")}
        </td>
      </tr>
    </table>
    <p style="color:#888;font-size:12px;margin-top:16px;">Both buttons open the application in the portal, where your decision is recorded against your name.</p>
  `;
  return sendEmail(b.fromEmail, 
    to,
    `Reminder: ${projectName} is waiting for your approval`,
    emailShell(b, "Approval Reminder", body)
  , b.replyTo, undefined, undefined, { kind: "spend.approval_reminder" });
}

// --- Action items -----------------------------------------------------------


// A progress bar that survives a mail client, so it is a table and not a div.
function progressBar(percent: number, PRIMARY: string): string {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:4px 0 0;">
      <tr>
        <td bgcolor="#e5e7eb" style="background:#e5e7eb;border-radius:999px;height:10px;padding:0;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="${pct}%" style="min-width:1%;">
            <tr><td bgcolor="${PRIMARY}" style="background:${PRIMARY};border-radius:999px;height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>
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
  /** The minutes it was raised in: its email then follows their read access in the sent box. */
  minutesId?: string;
}

function actionFactsBlock(facts: ActionEmailFacts, PRIMARY: string): string {
  const overdue = facts.daysLeft !== null && facts.daysLeft < 0;
  return `
    ${boxOpen("#f4f4f5", "16px", "16px 0")}
      <p style="margin:0;color:#333;"><strong>${esc(facts.ref)}:</strong> ${esc(facts.title)}</p>
      ${facts.description ? `<p style="margin:8px 0 0;color:#555;font-size:14px;">${esc(facts.description)}</p>` : ""}
      <p style="margin:12px 0 0;color:${overdue ? "#dc2626" : "#333"};"><strong>Due:</strong> ${esc(dueLine(facts.dueDate, facts.daysLeft))}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Assigned to:</strong> ${esc(facts.assignedTo || "Nobody yet")}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Priority:</strong> ${esc(facts.priorityLabel)}</p>
      <p style="margin:8px 0 0;color:#333;"><strong>Status:</strong> ${esc(facts.statusLabel)}</p>
      ${progressBar(facts.progress, PRIMARY)}
    ${BOX_CLOSE}`;
}

// Sent the moment somebody is put on an action, so the first they hear of it is
// not a chase three days before it is due.
export async function sendActionAssignedEmail(
  to: string,
  recipientName: string,
  raisedByName: string,
  facts: ActionEmailFacts
): Promise<boolean> {
  const b = await mailBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const body = `
    <p style="color:#333;">Dear ${esc(recipientName)},</p>
    <p style="color:#333;">${esc(raisedByName)} has assigned you an action item.</p>
    ${actionFactsBlock(facts, PRIMARY)}
    <p style="color:#333;">Please update your progress in the portal as the work moves along. You will get a reminder before it is due.</p>
    ${button(`${siteOf(b)}/action-items`, `Open the action`, PRIMARY)}
  `;
  return sendEmail(b.fromEmail, 
    to,
    `Action ${facts.ref}: ${facts.title}`,
    emailShell(b, "You have a new action item", body)
  , b.replyTo, undefined, undefined, { kind: "action.assigned", ...(facts.minutesId ? { minutesId: facts.minutesId } : { personal: true }) });
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
  const b = await mailBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const overdue = facts.daysLeft !== null && facts.daysLeft < 0;
  const body = `
    <p style="color:#333;">Dear ${esc(recipientName)},</p>
    <p style="color:#333;">${esc(why)}</p>
    ${note ? `<p style="color:#333;">${esc(note)}</p>` : ""}
    ${actionFactsBlock(facts, PRIMARY)}
    <p style="color:#666;font-size:13px;">You are receiving this as: ${esc(role)}</p>
    ${button(`${siteOf(b)}/action-items`, `Update the progress`, overdue ? "#dc2626" : PRIMARY)}
    <p style="color:#666;font-size:13px;">Done already? Mark it done and these reminders stop. <a href="${siteOf(b)}/tutorials/action-done.mp4" style="color:${PRIMARY};">Watch how (23 seconds)</a></p>
  `;
  const subject = overdue
    ? `Overdue: ${facts.ref} ${facts.title}`
    : `Reminder: ${facts.ref} ${facts.title}`;
  return sendEmail(b.fromEmail, 
    to,
    subject,
    emailShell(b, overdue ? "An action is overdue" : "Action item reminder", body)
  , b.replyTo, undefined, undefined, { kind: "action.reminder", ...(facts.minutesId ? { minutesId: facts.minutesId } : { personal: true }) });
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
  b: MailBranding,
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
          <td style="padding:8px 0;border-bottom:1px solid #eee;color:#333;"><strong>${esc(a.ref)}</strong> ${esc(a.title)}<br><span style="color:#777;font-size:13px;">${esc(a.owners)}${a.meetingDate ? ` · Meeting ${esc(formatMeetingDate(a.meetingDate))}` : ""}</span></td>
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
          (m) => `${boxOpen("#f4f4f5", "12px 14px", "0 0 8px", "font-size:14px;")}
        <p style="margin:0;color:#333;"><strong>${esc(m.title)}</strong> <span style="color:#777;">(${esc(m.period)})</span></p>
        <p style="margin:6px 0 0;color:#333;">${m.signed} of ${m.total} signed. Waiting on: <strong>${esc(m.waitingOn.join(", ") || "nobody")}</strong></p>
      ${BOX_CLOSE}`
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
        <a href="${siteOf(b)}/forgot-password" style="display:inline-block;margin-top:10px;color:${PRIMARY};font-weight:600;">Set my password</a>
      </div>`
    : "";

  // Carl, 27 Oct: name them, so the chair knows whom to chase.
  const notSignedInBlock = accounts.notActivatedNames.length
    ? `${heading("Never signed in")}
      <p style="color:#333;font-size:14px;margin:0;">${accounts.notActivatedNames.map(esc).join(", ")}</p>
      <p style="color:#777;font-size:13px;margin:6px 0 0;">They can set a password from the sign-in page with "Forgot password".</p>`
    : "";

  const body = `
    ${e.preview ? `<p style="background:#fef3c7;color:#92400e;padding:8px 12px;border-radius:6px;font-size:13px;margin:0 0 16px;">Preview. Only you received this copy.</p>` : ""}
    <p style="color:#333;margin:0;">Here's your weekly SGB update for the week of ${esc(formatZaDate(e.weekOf))}.</p>
    ${cards}
    ${overdueBlock}
    ${minutesBlock}
    ${spendBlock}
    ${notSignedInBlock}
    ${activateBlock}
    <div style="text-align:center;margin:28px 0 8px;">
      ${button(`${siteOf(b)}`, `Open the ${esc(b.shortName)} portal`, PRIMARY, "center")}
      <p style="margin:10px 0 0;font-size:12px;color:#777;">${esc(siteOf(b).replace(/^https?:\/\//, ""))}</p>
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
  const b = await mailBranding();
  const { subject, html } = buildWeeklyUpdateEmail(b, to, recipientName, e);
  return sendEmail(b.fromEmail, to, subject, html, b.replyTo, undefined, undefined, { kind: "weekly_update", personal: true });
}

// --- Action items summary -----------------------------------------------------
//
// The full open register goes in the attached workbook. The body is the three
// numbers and the worst few, so somebody reading on a phone knows whether to
// open the file at all.

const SUMMARY_LIST_CAP = 8;

export interface ActionSummaryEmail {
  rows: import("@/lib/actionSummary").SummaryRow[];
  counts: import("@/lib/actionSummary").SummaryCounts;
  dueSoonDays: number;
  asOf: string; // YYYY-MM-DD
  /** "Every Monday at 07:00". Blank on a one-off send. */
  scheduleText: string;
  preview?: boolean;
  /** The workbook did not attach, so the body says where to find the list. */
  noAttachment?: boolean;
}

/** Pure: builds the subject and HTML, so a script can render it with no
 *  store and no mail provider. */
export function buildActionSummaryEmail(
  b: MailBranding,
  recipientName: string,
  e: ActionSummaryEmail
): { subject: string; html: string } {
  const PRIMARY = b.colors.primary;
  const RED = "#dc2626";
  const ORANGE = "#ea580c";
  const GREY = "#9ca3af";
  const { counts } = e;

  const cards = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 8px;border-collapse:collapse;">
      <tr>
        ${weeklyCard(WEEKLY_ICONS.actions, counts.open, "Open", `${counts.blocked} blocked`, PRIMARY)}
        ${weeklyCard("&#128308;", counts.overdue, "Overdue", "ETA has passed", counts.overdue ? RED : GREY)}
        ${weeklyCard("&#128992;", counts.dueSoon, "Due soon", `within ${e.dueSoonDays} days`, counts.dueSoon ? ORANGE : GREY)}
      </tr>
    </table>`;

  // Overdue first, then due soon: the list is already sorted that way.
  const urgent = e.rows.filter((r) => r.health === "overdue" || r.health === "due_soon");
  const line = (r: (typeof e.rows)[number]) => {
    const late = r.health === "overdue";
    const colour = late ? RED : ORANGE;
    const when = duePhrase(r.dueDate, r.daysLeft);
    return `<tr>
      <td width="4" bgcolor="${colour}" style="background:${colour};padding:0;font-size:0;">&nbsp;</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;color:#333;"><strong>${esc(r.ref)}</strong> ${esc(r.title)}<br><span style="color:#777;font-size:13px;">${esc(r.owners || "Nobody assigned")} &middot; ${r.progress}% done</span></td>
      <td style="padding:8px 0 8px 12px;border-bottom:1px solid #eee;color:${colour};white-space:nowrap;text-align:right;font-weight:600;" valign="top">${esc(when)}</td>
    </tr>`;
  };
  const urgentBlock = urgent.length
    ? `<h3 style="color:${b.colors.dark};font-size:16px;margin:24px 0 8px;">Needs attention</h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        ${urgent.slice(0, SUMMARY_LIST_CAP).map(line).join("")}
      </table>
      ${urgent.length > SUMMARY_LIST_CAP ? `<p style="color:#777;font-size:13px;margin:8px 0 0;">And ${urgent.length - SUMMARY_LIST_CAP} more in the attached workbook.</p>` : ""}`
    : `<p style="color:#047857;font-size:14px;margin:16px 0 0;">Nothing is overdue or due in the next ${e.dueSoonDays} days.</p>`;

  const attachmentNote = e.noAttachment
    ? `<p style="color:#92400e;background:#fef3c7;padding:10px 12px;border-radius:6px;font-size:13px;margin:20px 0 0;">The Excel file could not be attached to this email. The full list is on the Action Items page in the portal.</p>`
    : `<div style="border:1px solid #e4e4e7;border-radius:8px;padding:12px 14px;margin:20px 0 0;font-size:14px;color:#333;">
        &#128206; <strong>Attached:</strong> every open action item in Excel, with the person responsible, ETA, progress and latest update. Red is overdue, orange is due within ${e.dueSoonDays} days, and the colours keep up with the date whenever you open it.
      </div>`;

  const body = `
    ${e.preview ? `<p style="background:#fef3c7;color:#92400e;padding:8px 12px;border-radius:6px;font-size:13px;margin:0 0 16px;">Preview. Only you received this copy.</p>` : ""}
    <p style="color:#333;margin:0;">Dear ${esc(recipientName || "colleague")},</p>
    <p style="color:#333;">Here is where the action items stand as at ${esc(formatZaDate(e.asOf))}.</p>
    ${cards}
    ${urgentBlock}
    ${attachmentNote}
    <div style="text-align:center;margin:28px 0 8px;">
      ${button(`${siteOf(b)}/action-items`, `Open the action items`, PRIMARY, "center")}
    </div>
    <p style="color:#999;font-size:12px;margin:24px 0 0;">${e.scheduleText ? `This summary goes out ${esc(e.scheduleText.charAt(0).toLowerCase() + e.scheduleText.slice(1))}. ` : ""}You are on the list for it in the ${esc(b.fullName)} portal.</p>
  `;

  const bits = [`${counts.open} open`, `${counts.overdue} overdue`, ...(counts.dueSoon ? [`${counts.dueSoon} due soon`] : [])];
  const subject = `${e.preview ? "[Preview] " : ""}${b.shortName} action items: ${bits.join(", ")}`;
  return { subject, html: emailShell(b, "Action items summary", body) };
}

export async function sendActionSummaryEmail(
  b: MailBranding,
  to: string,
  recipientName: string,
  e: ActionSummaryEmail,
  attachment: EmailAttachment
): Promise<boolean> {
  if (!b.siteUrl) b = { ...b, siteUrl: await schoolSiteUrl() };
  const { subject, html } = buildActionSummaryEmail(b, recipientName, e);
  const bare = buildActionSummaryEmail(b, recipientName, { ...e, noAttachment: true }).html;
  return sendEmail(b.fromEmail, to, subject, html, b.replyTo, [attachment], bare, { kind: "action_summary", personal: true });
}

// --- Meeting room bookings ------------------------------------------------------
//
// Ported from the COLAB hub. Every one goes ONLY to people who are party to the
// booking: its holders (who booked it, and who it is for) or whoever asked for
// the room. Dates and times arrive already written out.

export interface RoomBookingEmailFacts {
  roomName: string;
  title: string;
  dateLabel: string;
  timeLabel: string;
  attendeeCount: number;
  bookedForName?: string | null;
  bookedByName?: string | null;
  recurrenceLabel?: string | null;
  occurrences?: number;
}

function bookingRow(label: string, value: string): string {
  return `<p style="margin:6px 0 0;color:#333;"><strong>${label}:</strong> ${esc(value)}</p>`;
}

function bookingFactsBlock(f: RoomBookingEmailFacts): string {
  return `
    ${boxOpen("#f4f4f5", "16px", "16px 0")}
      ${bookingRow("Room", f.roomName)}
      ${bookingRow("Meeting", f.title)}
      ${bookingRow("When", `${f.dateLabel}, ${f.timeLabel}`)}
      ${bookingRow("Attendees", String(f.attendeeCount))}
      ${f.bookedForName ? bookingRow("Booked for", f.bookedForName) : ""}
      ${f.bookedForName && f.bookedByName ? bookingRow("Booked by", f.bookedByName) : ""}
      ${f.recurrenceLabel ? bookingRow("Repeats", f.occurrences && f.occurrences > 1 ? `${f.recurrenceLabel} (${f.occurrences} bookings)` : f.recurrenceLabel) : ""}
    ${BOX_CLOSE}`;
}

function bookingButton(PRIMARY: string, href: string, label: string): string {
  return `${button(`${href}`, `${label}`, PRIMARY)}`;
}

async function sendBookingMail(to: string, subject: string, heading: string, body: (PRIMARY: string, site: string) => string, meta: EmailMeta = { kind: "booking" }): Promise<boolean> {
  const b = await mailBranding();
  return sendEmail(b.fromEmail, to, subject, emailShell(b, heading, body(b.colors.primary, siteOf(b))), b.replyTo, undefined, undefined, meta);
}

const CALENDAR_LINK = (site: string) => `${site}/bookings`;

export function sendBookingConfirmedEmail(to: string, name: string, f: RoomBookingEmailFacts): Promise<boolean> {
  return sendBookingMail(to, `Room booked: ${f.roomName}, ${f.dateLabel}`, "Booking confirmed", (P, site) => `
    <p style="color:#333;">Dear ${esc(name)},</p>
    <p style="color:#333;">Your meeting room is booked. Here are the details:</p>
    ${bookingFactsBlock(f)}
    <p style="color:#666;font-size:13px;">If someone else needs the room they can ask you for it from the calendar. You will get an email, and nothing changes unless you agree.</p>
    ${bookingButton(P, CALENDAR_LINK(site), "View the room calendar")}
  `);
}

/** One email listing what changed on a booking someone else edited. */
export function sendBookingChangedEmail(to: string, name: string, editorName: string, changes: string[], f: RoomBookingEmailFacts): Promise<boolean> {
  return sendBookingMail(to, `Booking changed: ${f.roomName}, ${f.dateLabel}`, "Booking changed", (P, site) => `
    <p style="color:#333;">Dear ${esc(name)},</p>
    <p style="color:#333;">${esc(editorName)} changed this booking:</p>
    <ul style="background:#f4f4f5;padding:16px 16px 16px 32px;border-radius:6px;margin:16px 0;color:#333;">
      ${changes.map((c) => `<li style="margin:4px 0;">${esc(c)}</li>`).join("")}
    </ul>
    ${bookingFactsBlock(f)}
    ${bookingButton(P, CALENDAR_LINK(site), "View the room calendar")}
  `);
}

/** `when` comes from the meeting's actual date: a reminder sent on the day says today. */
export function sendBookingReminderEmail(to: string, name: string, f: RoomBookingEmailFacts, when: "today" | "tomorrow" = "tomorrow"): Promise<boolean> {
  const word = when === "today" ? "Today" : "Tomorrow";
  return sendBookingMail(to, `${word}: ${f.roomName}, ${f.title}`, `Room booking ${when}`, (P, site) => `
    <p style="color:#333;">Dear ${esc(name)},</p>
    <p style="color:#333;">A reminder that you have a meeting room booked ${when}.</p>
    ${bookingFactsBlock(f)}
    <p style="color:#666;font-size:13px;">If you no longer need it, please cancel it so someone else can use the room.</p>
    ${bookingButton(P, CALENDAR_LINK(site), "View the room calendar")}
  `);
}

/** To the person an edit made the room FOR. */
export function sendBookingHandedOverEmail(
  to: string,
  name: string,
  previousHolderName: string,
  changedByName: string,
  f: RoomBookingEmailFacts
): Promise<boolean> {
  return sendBookingMail(to, `${f.roomName} is now booked for you, ${f.dateLabel}`, "Booking changed hands", (P, site) => `
    <p style="color:#333;">Dear ${esc(name)},</p>
    <p style="color:#333;">${esc(changedByName)} has changed who this meeting room is for. It was for <strong>${esc(previousHolderName)}</strong>. It is now for you.</p>
    ${bookingFactsBlock(f)}
    <p style="color:#666;font-size:13px;">You will get the reminder before the meeting, and any request for the room comes to you. If this is not right, speak to whoever made the change, or cancel it from the calendar.</p>
    ${bookingButton(P, CALENDAR_LINK(site), "View the room calendar")}
  `);
}

/** To the person the room is no longer for. The booker stays a holder whoever
 *  the room is for, so the two cases need different copy. */
export function sendBookingTakenOverEmail(
  to: string,
  name: string,
  newHolderName: string,
  changedByName: string,
  stillHolderAsBooker: boolean,
  f: RoomBookingEmailFacts
): Promise<boolean> {
  const standing = stillHolderAsBooker
    ? `You booked this room, so you are still on it: you will get the reminder before the meeting, and any request for the room still comes to you as well as to ${esc(newHolderName)}. It is simply no longer held in your name.`
    : `The booking still stands, as shown above. It is just no longer in your name: you will not get the reminder for it, and requests for the room will go to ${esc(newHolderName)} instead. If you still need the room, you can ask for it back from the calendar.`;
  return sendBookingMail(to, `${f.roomName} on ${f.dateLabel} is no longer booked for you`, "Booking changed hands", (P, site) => `
    <p style="color:#333;">Dear ${esc(name)},</p>
    <p style="color:#333;">${esc(changedByName)} has changed who this meeting room is for. It was for you. It is now for <strong>${esc(newHolderName)}</strong>.</p>
    ${bookingFactsBlock(f)}
    <p style="color:#666;font-size:13px;">${standing}</p>
    ${bookingButton(P, CALENDAR_LINK(site), "View the room calendar")}
  `);
}

/** "May I have the room?" to the current holder. Both links open a page in the
 *  portal that needs a sign-in; nothing is answered from the email itself. */
export function sendRoomRequestEmail(
  to: string,
  holderName: string,
  requesterName: string,
  requesterMeeting: string,
  message: string,
  yourMeeting: string,
  token: string,
  f: Pick<RoomBookingEmailFacts, "roomName" | "dateLabel" | "timeLabel">
): Promise<boolean> {
  return sendBookingMail(to, `${requesterName} is asking for ${f.roomName}, ${f.dateLabel}`, "Can they have the room?", (P, site) => {
    const link = `${site}/bookings/request/${encodeURIComponent(token)}`;
    return `
    <p style="color:#333;">Dear ${esc(holderName)},</p>
    <p style="color:#333;">${esc(requesterName)} is asking for the room you have booked. Nothing changes unless you say yes.</p>
    ${boxOpen("#f4f4f5", "16px", "16px 0")}
      ${bookingRow("Your booking", yourMeeting)}
      ${bookingRow("Room", f.roomName)}
      ${bookingRow("When", `${f.dateLabel}, ${f.timeLabel}`)}
      ${bookingRow("They need it for", requesterMeeting)}
    ${BOX_CLOSE}
    <p style="color:#333;">Their reason:</p>
    <blockquote style="margin:0 0 16px;padding:8px 12px;border-left:4px solid ${P};background:#fafafa;color:#333;">${esc(message)}</blockquote>
    ${bookingButton(P, `${link}?action=approve`, "Let them have it")}
    <p style="margin:16px 0 0;"><a href="${link}?action=decline" style="color:${P};">Or decline, and say why</a></p>
    <p style="color:#666;font-size:13px;">You will need to be signed in to the portal to answer.</p>
  `;
  },
    // The reason was typed for the holder alone: not kept in the sent box.
    { kind: "booking.request", personal: true }
  );
}

/** How many cancelled bookings one email lists; the rest are counted. */
export const CANCELLED_LIST_CAP = 20;
export function cappedList(lines: string[]): { shown: string[]; more: number } {
  const shown = lines.slice(0, CANCELLED_LIST_CAP);
  return { shown, more: lines.length - shown.length };
}

/** ONE email to a person listing several of their cancelled bookings in a
 *  room (a room retired, or a manager cancelling a series), not one per date. */
export function sendBookingsCancelledEmail(
  to: string,
  name: string,
  roomName: string,
  why: "room_retired" | "by_manager",
  managerName: string,
  lines: string[]
): Promise<boolean> {
  const { shown, more } = cappedList(lines);
  const intro =
    why === "room_retired"
      ? `${esc(roomName)} has been taken out of use, so ${lines.length === 1 ? "your booking below has" : "your bookings below have"} been cancelled. Please book another room.`
      : `${esc(managerName)} has cancelled ${lines.length === 1 ? "your booking" : "your bookings"} in ${esc(roomName)} listed below.`;
  const subject =
    why === "room_retired"
      ? `Cancelled: ${roomName} is no longer available`
      : `Cancelled by ${managerName}: ${lines.length === 1 ? "your booking" : `${lines.length} bookings`} in ${roomName}`;
  return sendBookingMail(to, subject, why === "room_retired" ? "Room no longer available" : "Booking cancelled", (P, site) => `
    <p style="color:#333;">Dear ${esc(name)},</p>
    <p style="color:#333;">${intro}</p>
    <ul style="background:#f4f4f5;padding:16px 16px 16px 32px;border-radius:6px;margin:16px 0;color:#333;">
      ${shown.map((l) => `<li style="margin:4px 0;">${esc(l)}</li>`).join("")}
      ${more > 0 ? `<li style="margin:4px 0;list-style:none;">and ${more} more</li>` : ""}
    </ul>
    ${bookingButton(P, CALENDAR_LINK(site), "Find another slot")}
  `);
}

/** The requester's ask can no longer be answered, and why. */
export function sendRoomRequestWithdrawnEmail(
  to: string,
  requesterName: string,
  why: string,
  f: Pick<RoomBookingEmailFacts, "roomName" | "dateLabel" | "timeLabel">
): Promise<boolean> {
  return sendBookingMail(to, `Your request for ${f.roomName}, ${f.dateLabel}, has lapsed`, "Request no longer needed", (P, site) => `
    <p style="color:#333;">Dear ${esc(requesterName)},</p>
    <p style="color:#333;">Your request for ${esc(f.roomName)} on ${esc(f.dateLabel)} at ${esc(f.timeLabel)} can no longer be answered: ${esc(why)}.</p>
    ${bookingButton(P, CALENDAR_LINK(site), "Find another slot")}
  `);
}

/** A room manager agreed to a request on the holder's behalf. */
export function sendBookingGivenAwayEmail(
  to: string,
  holderName: string,
  managerName: string,
  requesterName: string,
  f: RoomBookingEmailFacts
): Promise<boolean> {
  return sendBookingMail(to, `${f.roomName} on ${f.dateLabel} was given to ${requesterName}`, "Booking handed over", (P, site) => `
    <p style="color:#333;">Dear ${esc(holderName)},</p>
    <p style="color:#333;">${esc(requesterName)} asked for the room you had booked, and ${esc(managerName)} agreed to hand it over. The slot is now theirs.</p>
    ${bookingFactsBlock(f)}
    ${bookingButton(P, CALENDAR_LINK(site), "Find another slot")}
  `);
}

export function sendRoomRequestApprovedEmail(
  to: string,
  requesterName: string,
  holderName: string,
  f: Pick<RoomBookingEmailFacts, "roomName" | "dateLabel" | "timeLabel" | "title">
): Promise<boolean> {
  return sendBookingMail(to, `You have ${f.roomName}, ${f.dateLabel}`, "Request approved", (P, site) => `
    <p style="color:#333;">Dear ${esc(requesterName)},</p>
    <p style="color:#333;">${esc(holderName)} has given you the room. It is booked in your name, so there is nothing further to do.</p>
    ${boxOpen("#f4f4f5", "16px", "16px 0")}
      ${bookingRow("Room", f.roomName)}
      ${bookingRow("Meeting", f.title)}
      ${bookingRow("When", `${f.dateLabel}, ${f.timeLabel}`)}
    ${BOX_CLOSE}
    ${bookingButton(P, CALENDAR_LINK(site), "View the room calendar")}
  `);
}

export function sendRoomRequestDeclinedEmail(
  to: string,
  requesterName: string,
  holderName: string,
  reason: string,
  f: Pick<RoomBookingEmailFacts, "roomName" | "dateLabel" | "timeLabel">
): Promise<boolean> {
  return sendBookingMail(to, `${holderName} declined your request for ${f.roomName}, ${f.dateLabel}`, "Request declined", (P, site) => `
    <p style="color:#333;">Dear ${esc(requesterName)},</p>
    <p style="color:#333;">${esc(holderName)} declined your request for ${esc(f.roomName)} on ${esc(f.dateLabel)} at ${esc(f.timeLabel)}. The booking stays as it is.</p>
    <p style="color:#333;">Their reason:</p>
    <blockquote style="margin:0 0 16px;padding:8px 12px;border-left:4px solid ${P};background:#fafafa;color:#333;">${esc(reason)}</blockquote>
    ${bookingButton(P, CALENDAR_LINK(site), "Find another slot")}
  `,
    // The holder's reason was typed for the requester alone: not kept.
    { kind: "booking.declined", personal: true }
  );
}
