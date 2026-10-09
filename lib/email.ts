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
// --- The look -----------------------------------------------------------------
//
// Every email is a white card on a pale canvas, with the crest and school name
// above it and a thin strip of the school's colour along its top edge. The
// school's colour is kept for the strip, the buttons and the small label over
// the title; everything else is neutral greys, which is what keeps it reading
// as current rather than as a coloured banner.
//
// Layout is tables throughout, because Outlook draws mail with Word's engine
// and ignores flex, grid and most of what a div can do. Styles are inline
// because Gmail strips most of a <style> block; the one in the head only adds
// the phone layout, for the clients that honour it, and nothing depends on it.

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const INK = "#18181b"; // headings, values
const TEXT = "#3f3f46"; // body copy
const MUTED = "#71717a"; // labels, fine print
const LINE = "#e4e4e7"; // borders, dividers
const SOFT = "#fafafa"; // panels inside the card
const CANVAS = "#f4f4f5"; // behind the card
const GREEN = "#059669";
const RED = "#dc2626";
const AMBER = "#d97706";

type Tone = "neutral" | "info" | "good" | "warn" | "bad";
const TONES: Record<Tone, { bg: string; fg: string; edge: string }> = {
  neutral: { bg: "#f4f4f5", fg: "#3f3f46", edge: "#d4d4d8" },
  info: { bg: "#eff6ff", fg: "#1e40af", edge: "#93c5fd" },
  good: { bg: "#ecfdf5", fg: "#047857", edge: "#6ee7b7" },
  warn: { bg: "#fffbeb", fg: "#92400e", edge: "#fbbf24" },
  bad: { bg: "#fef2f2", fg: "#b91c1c", edge: "#fca5a5" },
};

interface ShellOptions {
  /** Small capitals over the title: what KIND of email this is. */
  eyebrow?: string;
  /** The line an inbox shows beside the subject. Without it the inbox shows
   *  whatever text comes first, which is the school's name. */
  preheader?: string;
}

/** A paragraph of body copy. */
function p(html: string, extra = ""): string {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:24px;color:${TEXT};${extra}">${html}</p>`;
}

/** Small grey print under the main content. */
function fine(html: string, extra = ""): string {
  return `<p style="margin:16px 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};${extra}">${html}</p>`;
}

/** A button that survives Outlook: the colour is on the cell, so it still
 *  shows as a button where the link's own padding is ignored. */
function buttonCell(href: string, label: string, colour: string, outline = false): string {
  const bg = outline ? "#ffffff" : colour;
  const fg = outline ? colour : "#ffffff";
  // Outlook ignores padding on a link, so the cell carries it there
  // (mso-padding-alt) and the link carries it everywhere else.
  return `<td bgcolor="${bg}" style="border-radius:10px;background:${bg};mso-padding-alt:13px 26px;${outline ? `border:1px solid ${colour};` : ""}">
      <a href="${href}" style="display:inline-block;padding:13px 26px;mso-padding-alt:0;font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;color:${fg};text-decoration:none;border-radius:10px;">${label}</a>
    </td>`;
}

function button(href: string, label: string, colour: string, align: "left" | "center" = "left"): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ${align === "center" ? `align="center" ` : ""}style="margin:24px ${align === "center" ? "auto" : "0"} 4px;">
    <tr>${buttonCell(href, `${label} &rarr;`, colour)}</tr>
  </table>`;
}

/** Labelled facts, label on the left and value on the right, in a soft panel.
 *  Values are HTML, so a caller escapes typed text before passing it. */
function details(rows: [string, string][], head?: { title: string; sub?: string }): string {
  const lines = rows
    .map(
      ([label, value], i) => `<tr>
        <td valign="top" style="padding:11px 0;${i || head ? `border-top:1px solid ${LINE};` : ""}font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};width:42%;">${label}</td>
        <td valign="top" style="padding:11px 0 11px 12px;${i || head ? `border-top:1px solid ${LINE};` : ""}font-family:${FONT};font-size:14px;line-height:20px;color:${INK};font-weight:500;text-align:right;">${value}</td>
      </tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;background:${SOFT};border:1px solid ${LINE};border-radius:12px;border-collapse:separate;">
    <tr><td style="padding:${head ? "16px" : "6px"} 20px 6px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${
          head
            ? `<tr><td colspan="2" style="padding:0 0 12px;font-family:${FONT};">
            <div style="font-size:16px;line-height:22px;font-weight:600;color:${INK};">${head.title}</div>
            ${head.sub ? `<div style="margin-top:2px;font-size:13px;line-height:20px;color:${MUTED};">${head.sub}</div>` : ""}
          </td></tr>`
            : ""
        }
        ${lines}
      </table>
    </td></tr>
  </table>`;
}

/** The thing the email is about (a set of minutes, a project), as a panel
 *  with a title and a line under it. */
function subjectPanel(title: string, sub?: string, more = ""): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;background:${SOFT};border:1px solid ${LINE};border-radius:12px;border-collapse:separate;">
    <tr><td style="padding:18px 20px;font-family:${FONT};">
      <div style="font-size:16px;line-height:22px;font-weight:600;color:${INK};">${title}</div>
      ${sub ? `<div style="margin-top:2px;font-size:14px;line-height:20px;color:${MUTED};">${sub}</div>` : ""}
      ${more}
    </td></tr>
  </table>`;
}

/** A tinted note with a coloured edge: somebody's comment, a warning. */
function callout(html: string, tone: Tone, extra = ""): string {
  const t = TONES[tone];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;border-collapse:separate;">
    <tr><td style="background:${t.bg};border-left:3px solid ${t.edge};border-radius:8px;padding:14px 16px;font-family:${FONT};font-size:14px;line-height:22px;color:${t.fg};${extra}">${html}</td></tr>
  </table>`;
}

/** A small rounded label: a status, a decision. */
function pill(text: string, tone: Tone): string {
  const t = TONES[tone];
  return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;background:${t.bg};color:${t.fg};font-family:${FONT};font-size:12px;line-height:20px;font-weight:600;white-space:nowrap;">${text}</span>`;
}

/** "Preview. Only you received this copy." at the very top. */
function previewBanner(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr><td>${pill("Preview &middot; only you received this copy", "warn")}</td></tr></table>`;
}

function sectionHeading(text: string): string {
  return `<h3 style="margin:28px 0 10px;font-family:${FONT};font-size:13px;line-height:20px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${MUTED};">${text}</h3>`;
}

function emailShell(b: SchoolBranding, title: string, body: string, opts: ShellOptions = {}): string {
  const PRIMARY = b.colors.primary;
  // The label over the title is small text on white, so it takes the DARKER
  // shade: HVPS cyan at 12px on white is too faint to read.
  const LABEL = b.colors.primaryDark || PRIMARY;
  // The strip along the top of the card is the one place the brighter accent
  // can go, so Jeppe gets its yellow and HVPS its cyan.
  const STRIP = b.colors.accent || PRIMARY;
  const LOGO_URL = logoUrl(b);
  const branding = b;
  const siteHost = SITE_URL.replace(/^https?:\/\//, "");
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light">
  <title>${title}</title>
  <!--[if mso]>
  <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  <style>
    /* Desktop Outlook falls back to Times New Roman when it does not
       recognise the first font in a stack. */
    table, td, div, p, a, span, h1, h3 { font-family:"Segoe UI", Arial, sans-serif !important; }
  </style>
  <![endif]-->
  <style>
    @media only screen and (max-width:620px) {
      .card-pad { padding:28px 22px !important; }
      .stat-pad { padding:12px 10px 14px !important; }
      .stat-num { font-size:26px !important; line-height:30px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${CANVAS};-webkit-text-size-adjust:100%;">
  ${
    opts.preheader
      ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(opts.preheader)}${"&#8199;&#65279;&#847; ".repeat(40)}</div>`
      : ""
  }
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};">
    <tr><td align="center" style="padding:32px 12px 40px;">
      <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
        <tr><td style="padding:0 4px 18px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            ${
              // 🔴 The crest is omitted entirely when a school has none, and
              // never falls back to a file. The fallback used to be /logo.png,
              // which is Hurlyvale's actual crest, so every email a new school
              // sent went out under another school's badge - to that school's
              // own governors.
              //
              // Nothing is drawn in its place: an inline SVG is the one thing
              // mail clients are worst at, and the school's NAME is right
              // beside it. A header with no crest reads as plain; a header with
              // a broken image reads as a forgery.
              LOGO_URL
                ? `<td valign="middle" style="padding-right:12px;"><img src="${LOGO_URL}" alt="${branding.logoAlt}" width="40" style="display:block;width:40px;height:auto;border:0;outline:none;text-decoration:none;"></td>`
                : ""
            }
            <td valign="middle" style="font-family:${FONT};">
              <div style="font-size:15px;line-height:20px;font-weight:700;color:${INK};">${branding.fullName}</div>
              <div style="font-size:13px;line-height:18px;color:${MUTED};">${branding.tagline}</div>
            </td>
          </tr></table>
        </td></tr>
        <tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${LINE};border-radius:16px;overflow:hidden;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td bgcolor="${STRIP}" style="height:4px;line-height:4px;mso-line-height-rule:exactly;font-size:0;background:${STRIP};border-radius:16px 16px 0 0;">&nbsp;</td></tr>
            <tr><td class="card-pad" style="padding:36px 40px 40px;">
              ${
                opts.eyebrow
                  ? `<div style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${LABEL};">${opts.eyebrow}</div>`
                  : ""
              }
              <h1 style="margin:0 0 20px;font-family:${FONT};font-size:24px;line-height:32px;font-weight:700;letter-spacing:-0.3px;color:${INK};">${title}</h1>
              ${body}
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:24px 16px 0;font-family:${FONT};font-size:12px;line-height:18px;color:#a1a1aa;">
          <div style="font-weight:600;color:${MUTED};">${branding.fullName}</div>
          ${branding.slogan ? `<div style="font-style:italic;">&ldquo;${branding.slogan}&rdquo;</div>` : ""}
          <div style="margin-top:8px;"><a href="${SITE_URL}" style="color:#a1a1aa;text-decoration:underline;">${siteHost}</a></div>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
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
  const b = await resolveBranding();
  const branding = b;
  const PRIMARY = b.colors.primary;
  const body = `
    ${p(`Dear ${name},`)}
    ${p(`Welcome to the ${branding.shortName} ${branding.tagline}. Your account has been created.`)}
    ${details([
      ["Email", to],
      ["Temporary password", `<span style="font-family:Menlo,Consolas,monospace;letter-spacing:0.5px;">${password}</span>`],
    ])}
    ${p("Please log in and change your password immediately.", "margin-bottom:0;")}
    ${button(`${SITE_URL}/login`, "Log in now", PRIMARY)}
  `;
  return sendEmail(b.fromEmail, to, `Welcome to ${branding.shortName} ${branding.portalSubtitle}`, emailShell(b, "Welcome!", body, { eyebrow: "Your account", preheader: "Your account is ready. Here is how to log in." }), b.replyTo);
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
    ${p(`Dear ${name},`)}
    ${p(`An account has been created for you on the ${branding.shortName} ${branding.tagline}. To get in, choose your own password using the button below.`)}
    ${details([["You sign in with", to]])}
    ${button(url, "Choose your password", PRIMARY)}
    ${fine(`This link works once and expires in ${ttlMinutes} minutes. If it has expired by the time you get to it, use <strong>Forgot your password?</strong> on the sign-in page and it will send you a fresh one.`, "margin-top:20px;")}
  `;
  return sendEmail(b.fromEmail, to, `Set up your ${branding.shortName} ${branding.portalSubtitle} account`, emailShell(b, "Set up your account", body, { eyebrow: "Your account", preheader: "Choose a password to get into the portal." }), b.replyTo);
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
    ${p(`Dear ${name},`)}
    ${p(`Someone asked to reset the password for your ${branding.shortName} ${branding.tagline} account. If that was you, choose a new password using the button below.`, "margin-bottom:0;")}
    ${button(url, "Choose a new password", PRIMARY)}
    ${fine(`This link works once and expires in ${ttlMinutes} minutes.`, "margin-top:20px;")}
    ${fine("If you did not ask for this, you can ignore this email. Your password has not changed.", "margin-top:4px;")}
    ${fine(`If the button does not work, paste this into your browser:<br><span style="word-break:break-all;color:#a1a1aa;">${url}</span>`, `margin-top:20px;padding-top:16px;border-top:1px solid ${LINE};font-size:12px;`)}
  `;
  return sendEmail(b.fromEmail, to, `Reset your ${branding.shortName} ${branding.portalSubtitle} password`, emailShell(b, "Reset your password", body, { eyebrow: "Security", preheader: "Use the link inside to choose a new password." }), b.replyTo);
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
  const PRIMARY = b.colors.primary;
  const url = `${SITE_URL}/minutes/${minutesId}`;
  const body = `
    ${p(`Dear ${recipientName},`)}
    ${p(`${esc(fromName)} has sent you <strong>draft ${draftNumber}</strong> of the minutes below to check.`)}
    ${subjectPanel(esc(minutesTitle), esc(periodLabel), `<div style="margin-top:10px;">${pill(`Draft ${draftNumber}`, "info")}</div>`)}
    ${p("Please read it and either approve it, or send it back with a note saying what needs changing.", "margin-bottom:0;")}
    ${button(url, "Read and respond", PRIMARY)}
  `;
  return sendEmail(
    b.fromEmail,
    to,
    `Please check: ${minutesTitle}`,
    emailShell(b, "Minutes to check", body, { eyebrow: "Meeting minutes", preheader: `${fromName} has sent you draft ${draftNumber} to check.` }),
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
  const PRIMARY = b.colors.primary;
  const url = `${SITE_URL}/minutes/${minutesId}`;
  const body = `
    ${p(`Dear ${secretaryName},`)}
    ${p(`<strong>${esc(reviewerName)}</strong> has asked for changes to <strong>${esc(minutesTitle)}</strong> before it goes out for signing.`)}
    ${
      comments
        ? callout(`<div style="font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:4px;">${esc(reviewerName)} wrote</div><div style="white-space:pre-wrap;">${esc(comments)}</div>`, "warn")
        : fine("No note was left, so it is worth asking them what needs changing.", "margin:0 0 4px;font-size:14px;")
    }
    ${button(url, "Open the minutes", PRIMARY)}
  `;
  return sendEmail(
    b.fromEmail,
    to,
    `Changes requested: ${minutesTitle}`,
    emailShell(b, "Changes requested", body, { eyebrow: "Meeting minutes", preheader: `${reviewerName} has asked for changes before signing.` }),
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
  const PRIMARY = b.colors.primary;
  const url = `${SITE_URL}/minutes/${minutesId}`;
  const body = `
    ${p(`Dear ${recipientName},`)}
    ${p("The minutes below have been checked and are ready for your signature.")}
    ${subjectPanel(esc(minutesTitle), esc(periodLabel), `<div style="margin-top:10px;">${pill("Ready to sign", "good")}</div>`)}
    ${p("Open it, read it through, and sign it off.", "margin-bottom:0;")}
    ${button(url, "Read and sign", PRIMARY)}
    ${fine("Once everyone has signed, the minutes are locked and cannot be changed. If something is still wrong, send it back rather than signing.", "margin-top:20px;")}
  `;
  return sendEmail(
    b.fromEmail,
    to,
    `Ready to sign: ${minutesTitle}`,
    emailShell(b, "Ready to sign", body, { eyebrow: "Meeting minutes", preheader: `${minutesTitle} is ready for your signature.` }),
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
  const PRIMARY = b.colors.primary;
  // Straight to the document with the signature pad on it, not the summary
  // page: the link in a "please sign" email should open the thing to sign.
  const url = `${SITE_URL}/minutes/${minutesId}/sign`;
  const body = `
    ${p(`Dear ${recipientName},`)}
    ${p("The minutes below have been checked and are ready for your signature.")}
    ${subjectPanel(esc(minutesTitle), esc(periodLabel))}
    ${p("Read them through, then sign with this code:", "margin-bottom:10px;")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;border-collapse:separate;">
      <tr><td align="center" style="padding:20px 16px;border:1px dashed #d4d4d8;border-radius:12px;background:${SOFT};">
        <div style="font-family:Menlo,Consolas,'Courier New',monospace;font-size:34px;line-height:40px;letter-spacing:10px;font-weight:700;color:${INK};padding-left:10px;">${esc(code)}</div>
        <div style="margin-top:6px;font-family:${FONT};font-size:12px;line-height:16px;color:${MUTED};">Your signing code</div>
      </td></tr>
    </table>
    ${button(url, "Read and sign", PRIMARY)}
    ${callout("<strong>The code is yours alone.</strong> Do not pass it on: whoever uses it signs in your name.", "neutral", "font-size:13px;")}
    ${fine("Once everyone has signed, the minutes are locked and cannot be changed. If something is still wrong, ask the secretary to pull them back rather than signing.", "margin-top:0;")}
  `;
  return sendEmail(
    b.fromEmail,
    to,
    `Your signing code: ${minutesTitle}`,
    // No code in the preheader: it is shown in notifications on a locked phone.
    emailShell(b, "Ready to sign", body, { eyebrow: "Meeting minutes", preheader: `Your signing code for ${minutesTitle} is inside.` }),
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
  const PRIMARY = b.colors.primary;
  const url = `${SITE_URL}/minutes/${minutesId}`;
  const body = `
    ${p(`Dear ${recipientName},`)}
    ${p(`The minutes below have been signed and are now the final record.${
      attachment ? ` A copy is attached to this email (${esc(attachment.filename)}).` : ""
    }`)}
    ${subjectPanel(
      esc(minutesTitle),
      esc(periodLabel),
      `<div style="margin-top:10px;">${pill("&#10003; Signed", "good")}</div>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid ${LINE};font-size:14px;line-height:20px;color:${TEXT};"><span style="color:${MUTED};">Signed by</span> ${esc(signedBy.join(", "))}</div>`
    )}
    ${button(url, "Read the signed minutes", PRIMARY)}
    ${fine(`Document reference <span style="font-family:Menlo,Consolas,monospace;color:${TEXT};">${esc(documentRef)}</span>. This identifies the exact wording that was signed, so a later copy can be checked against it.`, "margin-top:20px;")}
  `;
  return sendEmail(
    b.fromEmail,
    to,
    `Signed: ${minutesTitle}`,
    emailShell(b, "Signed minutes", body, { eyebrow: "Meeting minutes", preheader: `${minutesTitle} is signed and is now the final record.` }),
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
  const PRIMARY = b.colors.primary;
  const body = `
    ${p(`Dear ${recipientName},`)}
    ${p("A new spend application has been submitted and requires your review.")}
    ${details([
      ["Amount", `<span style="font-size:16px;font-weight:700;">R${amount.toLocaleString()}</span>`],
      ["Submitted by", submittedBy],
    ], { title: projectName })}
    ${button(`${SITE_URL}/spend`, "Review application", PRIMARY)}
  `;
  return sendEmail(b.fromEmail, to, `Spend Application: ${projectName}`, emailShell(b, "New Spend Application", body, { eyebrow: "Spend", preheader: `${projectName}, R${amount.toLocaleString()}, submitted by ${submittedBy}.` }), b.replyTo);
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
  const PRIMARY = b.colors.primary;
  const intro = submitterName
    ? `${submitterName} has submitted an application for school funds spend on your behalf for: <strong>"${projectName}"</strong>`
    : `Your application for school funds spend has been received for: <strong>"${projectName}"</strong>`;

  // No approvers means the amount fell in a logged-only band. Saying "sent to:"
  // with an empty list would read as though the mail had gone nowhere.
  const routing = approverNames.length
    ? p(`It has been sent for approval to: ${approverNames.join(", ")}.`)
    : callout("This amount does not require approval, so the application has been logged and approved automatically.", "good");

  const quotes = quoteCount
    ? p(`${quoteCount} quote${quoteCount !== 1 ? "s were" : " was"} submitted with it.`)
    : "";

  const body = `
    ${p(`Dear ${applicantName},`)}
    ${p(intro)}
    ${quotes}
    ${routing}
    ${button(`${SITE_URL}/spend`, "View application", PRIMARY)}
  `;
  return sendEmail(b.fromEmail,
    to,
    `Spend Application Submitted: ${projectName}`,
    emailShell(b, "Application Submitted", body, { eyebrow: "Spend", preheader: `Your application for ${projectName} has been received.` })
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
  attachments?: EmailAttachment[],
  /** The body to send instead if the message has to go without its
   *  attachments, so it does not promise a file that is not there. */
  htmlWithoutAttachments?: string
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
      ({ error } = await resend.emails.send(
        htmlWithoutAttachments ? { ...message, html: htmlWithoutAttachments } : message
      ));
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
  const PRIMARY = b.colors.primary;
  const noteBlock = note
    ? p(note)
    : p("This is a scheduled reminder about the project below.");
  const body = `
    ${p(`Dear ${recipientName},`)}
    ${noteBlock}
    ${details([
      ["Amount", `R${amount.toLocaleString()}`],
      ["Status", pill(statusLabel, "neutral")],
      ["You are receiving this as", role],
    ], { title: projectName })}
    ${button(`${SITE_URL}/spend`, "Open the project", PRIMARY)}
  `;
  return sendEmail(b.fromEmail,
    to,
    `Reminder: ${projectName}`,
    emailShell(b, "Project Reminder", body, { eyebrow: "Reminder", preheader: `${projectName}: ${statusLabel}.` })
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
  const url = `${SITE_URL}/spend/${spendId}`;
  const body = `
    ${p(`Dear ${approverName},`)}
    ${p("A fund application needs your decision.")}
    ${details([
      ["Estimated cost", `<span style="font-size:16px;font-weight:700;">R${amount.toLocaleString()}</span>`],
      ["Suggested source of funds", sourceOfFunds || "Not stated"],
      ["Quotes submitted", String(quoteCount)],
      ["Submitted by", submittedBy],
      ["Approval level", tierLabel],
      ...(requiredBy ? ([["Approval required by", `<span style="color:${AMBER};">${requiredBy}</span>`]] as [string, string][]) : []),
    ], { title: projectName })}
    ${p("Open the application to read it in full, then approve, decline, or ask a question.", "margin-bottom:0;")}
    ${decisionButtons(url)}
    ${fine("Both buttons open the application in the portal, where your decision is recorded against your name.", "font-size:12px;")}
  `;
  return sendEmail(b.fromEmail,
    to,
    `Approval needed: ${projectName} (R${amount.toLocaleString()})`,
    emailShell(b, "Fund Application Approval", body, { eyebrow: "Approval needed", preheader: `${projectName}, R${amount.toLocaleString()}, needs your decision.` })
  , b.replyTo);
}

// Approve and Decline side by side. Decline is the outline one, so the two never
// read as equal weight at a glance.
function decisionButtons(url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 4px;">
      <tr>
        ${buttonCell(`${url}?decision=approve`, "&#10003;&nbsp; Approve", GREEN)}
        <td style="width:10px;font-size:0;">&nbsp;</td>
        ${buttonCell(`${url}?decision=decline`, "Decline", RED, true)}
      </tr>
    </table>`;
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
  const PRIMARY = b.colors.primary;
  // The decision arrives as display text ("Approved", "Declined", "Query").
  const d = decision.toLowerCase();
  const decisionTone: Tone = d.startsWith("approv") ? "good" : d.startsWith("declin") || d.startsWith("reject") ? "bad" : "warn";
  const body = `
    ${p(`Dear ${applicantName},`)}
    ${p("There has been an update on your fund application.")}
    ${details([
      [approverName, pill(decision.charAt(0).toUpperCase() + decision.slice(1), decisionTone)],
      ["Progress", `${approved} of ${total} approvals in`],
    ], { title: projectName })}
    ${comments ? callout(`<div style="font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:4px;">Their comment</div>${comments}`, "neutral") : ""}
    ${total > 0 ? progressBar((approved / total) * 100, PRIMARY, `${approved} of ${total} approved`) : ""}
    ${button(`${SITE_URL}/spend/${spendId}`, "View the application", PRIMARY)}
  `;
  return sendEmail(b.fromEmail,
    to,
    `Update on ${projectName}: ${approved} of ${total} approved`,
    emailShell(b, "Application Update", body, { eyebrow: "Spend", preheader: `${approverName}: ${decision}. ${approved} of ${total} approvals in.` })
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
  const PRIMARY = b.colors.primary;
  const body = `
    ${p(`Dear ${applicantName},`)}
    ${p("Your fund application has been <strong>fully approved</strong>.")}
    ${details([
      ["Approved amount", `<span style="font-size:16px;font-weight:700;color:${GREEN};">R${amount.toLocaleString()}</span>`],
      ["Approved by", approverNames.join(", ")],
    ], { title: projectName, sub: pill("&#10003; Fully approved", "good") })}
    ${button(`${SITE_URL}/spend/${spendId}`, "View the application", PRIMARY)}
  `;
  return sendEmail(b.fromEmail,
    to,
    `Approved: ${projectName}`,
    emailShell(b, "Application Approved", body, { eyebrow: "Spend", preheader: `${projectName} is fully approved for R${amount.toLocaleString()}.` })
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
  const url = `${SITE_URL}/spend/${spendId}`;
  const others = stillWaitingOn.filter((n) => n !== approverName);
  const waited =
    waitingDays > 0
      ? `It has been waiting ${waitingDays} day${waitingDays === 1 ? "" : "s"}.`
      : "It was submitted today.";
  const body = `
    ${p(`Dear ${approverName},`)}
    ${p(`This is a reminder that a fund application is waiting for your decision. ${waited}`)}
    ${details([
      ["Estimated cost", `<span style="font-size:16px;font-weight:700;">R${amount.toLocaleString()}</span>`],
      ["Suggested source of funds", sourceOfFunds || "Not stated"],
      ["Quotes submitted", String(quoteCount)],
      ["Reminder sent by", chasedBy],
      ...(others.length > 0 ? ([["Also still to decide", others.join(", ")]] as [string, string][]) : []),
    ], {
      title: projectName,
      sub: waitingDays > 0 ? pill(`Waiting ${waitingDays} day${waitingDays === 1 ? "" : "s"}`, waitingDays >= 7 ? "bad" : "warn") : undefined,
    })}
    ${decisionButtons(url)}
    ${fine("Both buttons open the application in the portal, where your decision is recorded against your name.", "font-size:12px;")}
  `;
  return sendEmail(b.fromEmail,
    to,
    `Reminder: ${projectName} is waiting for your approval`,
    emailShell(b, "Approval Reminder", body, { eyebrow: "Reminder", preheader: `${projectName} is waiting for your decision. ${waited}` })
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
function progressBar(percent: number, PRIMARY: string, label?: string): string {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:4px 0 20px;">
      <tr>
        <td style="font-family:${FONT};font-size:12px;line-height:16px;color:${MUTED};padding:0 0 6px;">Progress</td>
        <td style="font-family:${FONT};font-size:12px;line-height:16px;color:${INK};font-weight:600;padding:0 0 6px;text-align:right;">${label ?? `${pct}% complete`}</td>
      </tr>
      <tr>
        <td colspan="2" style="background:${LINE};border-radius:999px;height:8px;padding:0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${Math.max(pct, 1)}%">
            <tr><td style="background:${PRIMARY};border-radius:999px;height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
          </table>
        </td>
      </tr>
    </table>`;
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
  const soon = !overdue && facts.daysLeft !== null && facts.daysLeft <= 3;
  const priority = facts.priorityLabel.toLowerCase();
  const priorityTone: Tone = priority.startsWith("high") || priority.startsWith("urgent") || priority.startsWith("critical") ? "bad" : priority.startsWith("med") ? "warn" : "neutral";
  return `
    ${details(
      [
        ["Due", `<span style="color:${overdue ? RED : soon ? AMBER : INK};">${esc(dueLine(facts.dueDate, facts.daysLeft))}</span>`],
        ["Assigned to", esc(facts.assignedTo || "Nobody yet")],
        ["Priority", pill(esc(facts.priorityLabel), priorityTone)],
        ["Status", pill(esc(facts.statusLabel), "neutral")],
      ],
      {
        title: `<span style="color:${MUTED};font-weight:600;">${esc(facts.ref)}</span>&nbsp; ${esc(facts.title)}`,
        sub: facts.description ? esc(facts.description) : undefined,
      }
    )}
    ${progressBar(facts.progress, PRIMARY)}`;
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
  const PRIMARY = b.colors.primary;
  const body = `
    ${p(`Dear ${esc(recipientName)},`)}
    ${p(`${esc(raisedByName)} has assigned you an action item.`)}
    ${actionFactsBlock(facts, PRIMARY)}
    ${p("Please update your progress in the portal as the work moves along. You will get a reminder before it is due.", "margin-bottom:0;")}
    ${button(`${SITE_URL}/action-items`, "Open the action", PRIMARY)}
  `;
  return sendEmail(b.fromEmail,
    to,
    `Action ${facts.ref}: ${facts.title}`,
    emailShell(b, "You have a new action item", body, { eyebrow: "Action item", preheader: `${raisedByName} has assigned you ${facts.ref}: ${facts.title}.` })
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
  const PRIMARY = b.colors.primary;
  const overdue = facts.daysLeft !== null && facts.daysLeft < 0;
  const body = `
    ${p(`Dear ${esc(recipientName)},`)}
    ${overdue ? callout(`<strong>${esc(why)}</strong>`, "bad") : p(esc(why))}
    ${note ? p(esc(note)) : ""}
    ${actionFactsBlock(facts, PRIMARY)}
    ${button(`${SITE_URL}/action-items`, "Update the progress", overdue ? RED : PRIMARY)}
    ${fine(`You are receiving this as: ${esc(role)}`, "margin-top:20px;")}
  `;
  const subject = overdue
    ? `Overdue: ${facts.ref} ${facts.title}`
    : `Reminder: ${facts.ref} ${facts.title}`;
  return sendEmail(b.fromEmail,
    to,
    subject,
    emailShell(b, overdue ? "An action is overdue" : "Action item reminder", body, {
      eyebrow: overdue ? "Overdue" : "Reminder",
      preheader: `${facts.ref}: ${facts.title}. ${why}`,
    })
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
    <td width="33%" valign="top" style="padding:5px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:12px;background:#ffffff;border-collapse:separate;">
        <tr><td class="stat-pad" style="padding:16px 16px 18px;font-family:${FONT};">
          <div style="font-size:18px;line-height:20px;">${icon}</div>
          <div class="stat-num" style="margin-top:10px;font-size:32px;line-height:36px;font-weight:700;letter-spacing:-0.5px;color:${colour};">${value}</div>
          <div style="margin-top:6px;font-size:13px;line-height:18px;font-weight:600;color:${INK};">${esc(label)}</div>
          <div style="margin-top:2px;font-size:12px;line-height:16px;color:${MUTED};">${esc(sub)}</div>
        </td></tr>
      </table>
    </td>`;
}

/** A row of three cards. Stays three across on a phone, just tighter: the
 *  point is the glance, and three stacked boxes push the lists off-screen. */
function cardRow(cells: string, extra = ""): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 4px;border-collapse:collapse;${extra}">
      <tr>${cells}</tr>
    </table>`;
}

/** One line in a list: what it is on the left with a grey line under it, a
 *  figure on the right, and an optional coloured edge. The edge cell is always
 *  there, blank when unused, or a list mixing the two loses its columns. */
function listRow(left: string, sub: string, right: string, rightColour: string, edge?: string): string {
  return `<tr>
      <td width="3" style="background:${edge || "transparent"};padding:0;font-size:0;line-height:0;border-radius:2px;">&nbsp;</td>
      <td style="padding:12px 12px;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:14px;line-height:20px;color:${INK};">${left}${sub ? `<div style="margin-top:2px;font-size:13px;line-height:18px;color:${MUTED};">${sub}</div>` : ""}</td>
      <td valign="top" style="padding:12px 0 12px 12px;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:13px;line-height:20px;font-weight:600;color:${rightColour};white-space:nowrap;text-align:right;">${right}</td>
    </tr>`;
}

function listTable(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0;">${rows}</table>`;
}

function moreLine(text: string): string {
  return fine(text, "margin-top:10px;");
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
  const { actions, accounts, minutes } = e.facts;
  const waitingSignatures = minutes.reduce((n, m) => n + m.waitingOn.length, 0);

  const actionSub =
    actions.overdue > 0
      ? `${actions.overdue} overdue`
      : actions.dueThisWeek > 0
        ? `${actions.dueThisWeek} due this week`
        : "none overdue";

  // Numbers are near-black unless they are a warning. Colour on every figure
  // reads as decoration; colour on one figure reads as "look at this".
  const cards = cardRow(`
        ${weeklyCard(WEEKLY_ICONS.actions, actions.open, "Open action items", actionSub, actions.overdue > 0 ? RED : INK)}
        ${weeklyCard(WEEKLY_ICONS.notSignedIn, accounts.notActivated, "Not yet signed in", `of ${accounts.total} portal users`, INK)}
        ${weeklyCard(WEEKLY_ICONS.minutes, minutes.length, "Minutes to sign", minutes.length ? `${waitingSignatures} signature${waitingSignatures === 1 ? "" : "s"} outstanding` : "all signed", minutes.length ? AMBER : INK)}`);

  const heading = (text: string) => sectionHeading(esc(text));

  const overdueBlock = actions.overdueList.length
    ? `${heading("Overdue action items")}
      ${listTable(
        actions.overdueList
          .slice(0, WEEKLY_LIST_CAP)
          .map((a) =>
            listRow(
              `<span style="color:${MUTED};font-weight:600;">${esc(a.ref)}</span>&nbsp; ${esc(a.title)}`,
              esc(a.owners),
              `${a.daysLate} day${a.daysLate === 1 ? "" : "s"} late`,
              RED,
              RED
            )
          )
          .join("")
      )}
      ${actions.overdueList.length > WEEKLY_LIST_CAP ? moreLine(`And ${actions.overdueList.length - WEEKLY_LIST_CAP} more in the portal.`) : ""}`
    : "";

  const minutesBlock = minutes.length
    ? `${heading("Minutes waiting for signatures")}
      ${listTable(
        minutes
          .slice(0, WEEKLY_LIST_CAP)
          .map((m) =>
            listRow(
              `<strong>${esc(m.title)}</strong> <span style="color:${MUTED};">(${esc(m.period)})</span>`,
              `Waiting on: <span style="color:${INK};">${esc(m.waitingOn.join(", ") || "nobody")}</span>`,
              `${m.signed} of ${m.total} signed`,
              AMBER,
              AMBER
            )
          )
          .join("")
      )}
      ${minutes.length > WEEKLY_LIST_CAP ? moreLine(`And ${minutes.length - WEEKLY_LIST_CAP} more in the portal.`) : ""}`
    : "";

  const spend = e.facts.spend;
  const rands = (n: number) => `R${Math.round(n).toLocaleString("en-ZA")}`;
  const spendBlock = e.seesSpend
    ? `${heading("Spend and projects")}
      ${cardRow(`
          ${weeklyCard(WEEKLY_ICONS.awaiting, spend.awaiting, "Awaiting approval", spend.awaiting ? rands(spend.awaitingValue) : "nothing waiting", INK)}
          ${weeklyCard(WEEKLY_ICONS.approved, spend.approved, "Approved", spend.approved ? `${rands(spend.approvedValue)} in progress` : "none in progress", spend.approved ? GREEN : INK)}
          ${weeklyCard(WEEKLY_ICONS.sentBack, spend.changes, "Sent back for changes", `${spend.completed} project${spend.completed === 1 ? "" : "s"} completed`, spend.changes > 0 ? AMBER : INK)}`, "margin-top:0;")}
      ${spend.awaitingList.length
        ? `<div style="height:8px;line-height:8px;font-size:0;">&nbsp;</div>${listTable(
            spend.awaitingList
              .slice(0, WEEKLY_LIST_CAP)
              .map((s) =>
                listRow(
                  `<strong>${esc(s.project)}</strong>`,
                  s.noApprovers
                    ? `<span style="color:${RED};">No approvers set, so this cannot move</span>`
                    : `${s.approved} of ${s.total} approved. Waiting on: ${esc(s.waitingOn.join(", ") || "nobody")}`,
                  rands(s.amount),
                  INK,
                  s.noApprovers ? RED : undefined
                )
              )
              .join("")
          )}
      ${spend.awaitingList.length > WEEKLY_LIST_CAP ? moreLine(`And ${spend.awaitingList.length - WEEKLY_LIST_CAP} more in the portal.`) : ""}`
        : ""}`
    : "";

  const activateBlock = e.notActivated
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;border-collapse:separate;">
        <tr><td style="border:1px solid ${LINE};border-left:3px solid ${PRIMARY};border-radius:10px;padding:16px 18px;font-family:${FONT};">
          <div style="font-size:14px;line-height:22px;color:${TEXT};"><strong style="color:${INK};">You have not signed in yet.</strong> Your account is ready. If you no longer have your temporary password, set a new one here:</div>
          <a href="${SITE_URL}/forgot-password" style="display:inline-block;margin-top:8px;font-size:14px;font-weight:600;color:${b.colors.primaryDark || PRIMARY};text-decoration:none;">Set my password &rarr;</a>
        </td></tr>
      </table>`
    : "";

  const body = `
    ${e.preview ? previewBanner() : ""}
    ${p(`Here's your weekly SGB update for the week of <strong style="color:${INK};">${esc(formatZaDate(e.weekOf))}</strong>.`, "margin:0;")}
    ${cards}
    ${overdueBlock}
    ${minutesBlock}
    ${spendBlock}
    ${activateBlock}
    <div style="text-align:center;margin:32px 0 0;">
      ${button(SITE_URL, `Open the ${esc(b.shortName)} portal`, PRIMARY, "center")}
    </div>
    ${fine(`You receive this because you have an account on the ${esc(b.fullName)} ${esc(b.tagline)}. Sent to ${esc(recipientName || to)}.`, `margin-top:28px;padding-top:16px;border-top:1px solid ${LINE};font-size:12px;`)}
  `;

  const subjectBits = [
    `${actions.open} open action${actions.open === 1 ? "" : "s"}`,
    ...(minutes.length ? [`${minutes.length} set${minutes.length === 1 ? "" : "s"} of minutes to sign`] : []),
    ...(e.seesSpend && spend.awaiting ? [`${spend.awaiting} project${spend.awaiting === 1 ? "" : "s"} awaiting approval`] : []),
  ];
  const subject = `${e.preview ? "[Preview] " : ""}${b.shortName} weekly SGB update: ${subjectBits.join(", ")}`;

  return {
    subject,
    html: emailShell(b, `Good day, ${esc(e.teamName)} team.`, body, {
      eyebrow: `Weekly update &middot; ${esc(formatZaDate(e.weekOf))}`,
      preheader: subjectBits.join(", ").replace(/^./, (c) => c.toUpperCase()) + ".",
    }),
  };
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
  b: SchoolBranding,
  recipientName: string,
  e: ActionSummaryEmail
): { subject: string; html: string } {
  const PRIMARY = b.colors.primary;
  const ORANGE = "#ea580c";
  const GREY = "#a1a1aa";
  const { counts } = e;

  const cards = cardRow(`
        ${weeklyCard(WEEKLY_ICONS.actions, counts.open, "Open", `${counts.blocked} blocked`, INK)}
        ${weeklyCard("&#128308;", counts.overdue, "Overdue", "ETA has passed", counts.overdue ? RED : GREY)}
        ${weeklyCard("&#128992;", counts.dueSoon, "Due soon", `within ${e.dueSoonDays} days`, counts.dueSoon ? ORANGE : GREY)}`);

  // Overdue first, then due soon: the list is already sorted that way.
  const urgent = e.rows.filter((r) => r.health === "overdue" || r.health === "due_soon");
  const line = (r: (typeof e.rows)[number]) => {
    const late = r.health === "overdue";
    const colour = late ? RED : ORANGE;
    const when = duePhrase(r.dueDate, r.daysLeft);
    return listRow(
      `<span style="color:${MUTED};font-weight:600;">${esc(r.ref)}</span>&nbsp; ${esc(r.title)}`,
      `${esc(r.owners || "Nobody assigned")} &middot; ${r.progress}% done`,
      esc(when),
      colour,
      colour
    );
  };
  const urgentBlock = urgent.length
    ? `${sectionHeading("Needs attention")}
      ${listTable(urgent.slice(0, SUMMARY_LIST_CAP).map(line).join(""))}
      ${urgent.length > SUMMARY_LIST_CAP ? moreLine(`And ${urgent.length - SUMMARY_LIST_CAP} more in the attached workbook.`) : ""}`
    : callout(`&#10003;&nbsp; Nothing is overdue or due in the next ${e.dueSoonDays} days.`, "good", "font-weight:600;");

  const attachmentNote = e.noAttachment
    ? callout("The Excel file could not be attached to this email. The full list is on the Action Items page in the portal.", "warn", "font-size:13px;")
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;border-collapse:separate;">
        <tr>
          <td width="44" valign="top" style="padding:16px 0 16px 16px;background:${SOFT};border:1px solid ${LINE};border-right:0;border-radius:12px 0 0 12px;font-size:22px;line-height:24px;">&#128206;</td>
          <td valign="top" style="padding:16px 18px 16px 10px;background:${SOFT};border:1px solid ${LINE};border-left:0;border-radius:0 12px 12px 0;font-family:${FONT};font-size:14px;line-height:22px;color:${TEXT};">
            <strong style="color:${INK};">Attached:</strong> every open action item in Excel, with the person responsible, ETA, progress and latest update. Red is overdue, orange is due within ${e.dueSoonDays} days, and the colours keep up with the date whenever you open it.
          </td>
        </tr>
      </table>`;

  const body = `
    ${e.preview ? previewBanner() : ""}
    ${p(`Dear ${esc(recipientName || "colleague")},`)}
    ${p(`Here is where the action items stand as at <strong style="color:${INK};">${esc(formatZaDate(e.asOf))}</strong>.`, "margin-bottom:0;")}
    ${cards}
    ${urgentBlock}
    ${attachmentNote}
    <div style="text-align:center;margin:32px 0 0;">
      ${button(`${SITE_URL}/action-items`, "Open the action items", PRIMARY, "center")}
    </div>
    ${fine(`${e.scheduleText ? `This summary goes out ${esc(e.scheduleText.charAt(0).toLowerCase() + e.scheduleText.slice(1))}. ` : ""}You are on the list for it in the ${esc(b.fullName)} portal.`, `margin-top:28px;padding-top:16px;border-top:1px solid ${LINE};font-size:12px;`)}
  `;

  const bits = [`${counts.open} open`, `${counts.overdue} overdue`, ...(counts.dueSoon ? [`${counts.dueSoon} due soon`] : [])];
  const subject = `${e.preview ? "[Preview] " : ""}${b.shortName} action items: ${bits.join(", ")}`;
  return {
    subject,
    html: emailShell(b, "Action items summary", body, {
      eyebrow: `Action items &middot; ${esc(formatZaDate(e.asOf))}`,
      preheader: `${bits.join(", ")}.`.replace(/^./, (c) => c.toUpperCase()),
    }),
  };
}

export async function sendActionSummaryEmail(
  b: SchoolBranding,
  to: string,
  recipientName: string,
  e: ActionSummaryEmail,
  attachment: EmailAttachment
): Promise<boolean> {
  const { subject, html } = buildActionSummaryEmail(b, recipientName, e);
  const bare = buildActionSummaryEmail(b, recipientName, { ...e, noAttachment: true }).html;
  return sendEmail(b.fromEmail, to, subject, html, b.replyTo, [attachment], bare);
}
