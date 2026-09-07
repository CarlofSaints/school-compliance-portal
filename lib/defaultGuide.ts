import type { SchoolBranding } from "./branding";
import { GOVERNANCE_LABEL } from "./positions";

// ---------------------------------------------------------------------------
// The guide every school starts with.
//
// Carl: "every school needs a guide. why dont we use our main branding to
// produce a generic one that can be used for all new sites?"
//
// 🔴 TEXT ONLY, no screenshots, and that is not a shortcut. The guide HVPS
// published carries 19 embedded screenshots of a real school: names off its
// governance register, its project names and its CAPEX figures. Serving that
// as the default for every new school would leak one school's records into
// every other one, which is the same mistake as the crest fallback and with
// far worse contents.
//
// Generated from the school's own branding rather than shipped as a fixed
// file, so it names the school reading it and follows its colours.
//
// A school that publishes its own guide overrides this entirely. This is the
// floor, not a ceiling.
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface Chapter {
  title: string;
  html: string;
}

function chapters(school: string, body: string): Chapter[] {
  return [
    {
      title: "Getting in",
      html: `
<p class="lede">Everyone who uses the portal has their own login. There is no shared password.</p>
<ol class="steps">
  <li>Go to your school's portal address and sign in with your email address.</li>
  <li>First time here, or forgotten it? Use <span class="ui">Forgot password</span> on the sign in page. A link arrives by email and is good for about an hour.</li>
  <li>The link works once. The moment you set a password it stops working, so ask for a new one rather than reusing an old email.</li>
</ol>
<div class="note">
  <span class="lbl">Nothing arrived?</span>
  <p>Check the junk folder first. School mail systems are cautious about mail from an address they have not seen before. If it is not there, ask an administrator to check the address held for you under <span class="ui">Admin</span>, <span class="ui">Users</span>: a link sent to an address nobody reads looks exactly like a link that was never sent.</p>
</div>`,
    },
    {
      title: "Finding your way around",
      html: `
<p class="lede">The sidebar is the whole portal. What you can see depends on what you are allowed to do.</p>
<ul>
  <li><strong>Dashboard</strong> is the summary: outstanding actions, spend awaiting approval, recent compliance checks.</li>
  <li><strong>People</strong> is the ${body} register: who holds which position.</li>
  <li><strong>Action Items</strong> is who agreed to do what, by when.</li>
  <li><strong>Meeting Minutes</strong> is where minutes are written, checked and signed.</li>
  <li><strong>Policies</strong> and <strong>Compliance</strong> hold the governance documents and the checks run against them.</li>
  <li><strong>Spend</strong> is funding applications, quotes and approvals.</li>
  <li><strong>Admin</strong> is everything that is set up once: users, roles, tags, branding.</li>
</ul>
<p>If a page you expect is missing, it is a permission rather than a fault. An administrator can grant it under <span class="ui">Admin</span>, <span class="ui">Roles</span>.</p>`,
    },
    {
      title: "Policies",
      html: `
<p class="lede">Every governance policy in one place, with its full history.</p>
<p>Upload a policy and the portal keeps it with a version history, so the copy the ${body} approved in March is still there after it is revised in September. Nothing is overwritten and nothing is lost.</p>
<ol class="steps">
  <li><span class="ui">Policies</span>, then <span class="ui">Upload a policy</span>.</li>
  <li>Give it a name a person would search for, not a filename.</li>
  <li>Replacing an existing policy adds a version rather than a second policy.</li>
</ol>`,
    },
    {
      title: "Running a compliance check",
      html: `
<p class="lede">Upload a document and get a compliance score against South African education law, with the gaps listed one by one.</p>
<p>Checks run against the <strong>BELA Act</strong>, <strong>SASA</strong> and provincial regulation. You get a score, and underneath it the specific gaps found: a delegation not recorded, a missing annual resolution, a code of conduct that is out of date.</p>
<div class="careful">
  <span class="lbl">What a check is and is not</span>
  <p>It surfaces gaps against the legislation. It does not make the school compliant, and it is not legal advice. The value is that somebody can run it on a Tuesday afternoon instead of discovering the same gaps during an audit.</p>
</div>
<p>Every check is saved, so the score can be compared after a policy is revised.</p>`,
    },
    {
      title: "Applying for funds",
      html: `
<p class="lede">How a project asks the ${body} for money.</p>
<p>Every request goes through the same form whatever the amount. Small amounts are logged rather than sent for approval, but they go through the same door, so the school ends up with one complete record of what was spent and why.</p>
<ul>
  <li><strong>The project and what it is for.</strong> Write it for somebody who was not in the meeting.</li>
  <li><strong>The estimated amount.</strong> This decides which approval band it falls into.</li>
  <li><strong>Where the money comes from.</strong> One request can be split across several sources.</li>
  <li><strong>Quotes.</strong> Attach them and record which supplier was chosen.</li>
</ul>`,
    },
    {
      title: "Approving spend",
      html: `
<p class="lede">Who has to approve a request is decided by the amount, and set once.</p>
<p>Under <span class="ui">Admin</span>, <span class="ui">Fund Application Approval Settings</span>, amount bands are matched to groups of people. Under one figure a request is only logged; over another it goes to the finance committee. Set the bands once and every application after that routes itself.</p>
<div class="careful">
  <span class="lbl">Approvers are FROZEN when a request is submitted</span>
  <p>Whoever was required at the moment it was submitted stays required. A committee that gains a member next week does not re-open an application that has already been decided.</p>
</div>
<p>Approvers are named people carried on a <strong>tag</strong>, not a job title, because approval authority belongs to a person rather than to a role.</p>`,
    },
    {
      title: "Writing the minutes",
      html: `
<p class="lede">Where a meeting's record is written, and what makes it the school's own document.</p>
<p>Open <span class="ui">Meeting Minutes</span> and choose <span class="ui">Add minutes</span>. There are two ways in and both end in the same place.</p>
<h3>Starting from a template</h3>
<p>A template is the shape of a meeting: the sections your ${body} always covers, in order, with the standing wording already filled in. The attendance list barely changes, so it lives on the template and gets edited rather than retyped.</p>
<ol class="steps">
  <li>Choose <span class="ui">Write them here</span> and pick a template.</li>
  <li>Name the minutes, choose the meeting, and set the period. A period can be a month, a quarter, or dates you choose.</li>
  <li>Type into each section. Every section has a heading, what was discussed, and who is responsible.</li>
</ol>
<div class="note">
  <span class="lbl">Why numbering starts partway down</span>
  <p>Attendance and apologies is not a numbered item, so numbering usually starts at the second or third section. Whoever sets the template decides which section is number 1.</p>
</div>
<h3>Uploading minutes you already have</h3>
<p>If the secretary writes in Word, choose <span class="ui">Upload a file</span>. The file is kept as it is, and the minutes can still be checked and signed.</p>
<h3>Your own letterhead</h3>
<p><span class="ui">Download as Word</span> produces the document to print or circulate. If the school has uploaded its own letterhead under <span class="ui">Admin</span>, <span class="ui">School Branding</span>, the minutes are placed into it. Your crest, fonts and footer are kept exactly as they are: the letterhead is filled in, never rebuilt.</p>`,
    },
    {
      title: "Sending a draft out for checking",
      html: `
<p class="lede">Before anyone signs, the draft goes to the people who check it.</p>
<p>Press <span class="ui">Send for checking</span>. Everyone on the school's draft list is emailed a link, opens the minutes, and either approves them or sends them back.</p>
<ul>
  <li><strong>Approve</strong> says the draft is a fair record of the meeting.</li>
  <li><strong>Send back</strong> asks for changes and <strong>requires a note</strong>. Without one the secretary is only told somebody is unhappy.</li>
</ul>
<p>One person sending it back returns the whole draft at once. There is no point collecting the rest of the approvals for a document already being rewritten.</p>
<div class="careful">
  <span class="lbl">An approval belongs to the draft it answered</span>
  <p>A rewritten set of minutes is a new draft and needs its own approvals. The earlier ones stay on the record as history but do not count. Nobody should walk into signing carrying approvals for a version no one read.</p>
</div>
<div class="note">
  <span class="lbl">You do not need to be an administrator to check a draft</span>
  <p>What decides it is being on the list the draft was sent to, nothing else.</p>
</div>`,
    },
    {
      title: "Signing the minutes",
      html: `
<p class="lede">Signing happens on the document itself, the way it does on Adobe or SignNow.</p>
<p>Everyone who signs is emailed <strong>their own six character code</strong>. The link opens the whole document, and signing sits underneath it, so you scroll past what you are agreeing to on the way there.</p>
<ol class="steps">
  <li>Open the link and read the minutes.</li>
  <li>Sign: <strong>draw</strong> with a finger or a mouse, or <strong>type</strong> your name in a signing hand. Either way it appears in the Word file.</li>
  <li>Type the code from your email and confirm.</li>
</ol>
<div class="careful">
  <span class="lbl">The code is the point</span>
  <p>It went to your address and nobody else's, it is never stored in a form anyone could read back, and it is used once. Do not forward it to somebody to sign on your behalf: the record will say you signed.</p>
</div>
<h3>The document reference</h3>
<p>Each signature records a fingerprint of the exact wording signed, shown on the minutes as a short reference. A copy produced next year can be checked against it. If a signature ever stops matching, the portal says so plainly rather than quietly recalculating, because that is evidence the record changed after signing.</p>
<h3>Signing on paper</h3>
<p>Download the Word file, sign by hand, and upload the scan with <span class="ui">Upload a signed copy</span>. That closes the minutes the same way and records the same fingerprint.</p>
<h3>Sending the signed minutes out</h3>
<p>When the last signature lands, the signed minutes go to everyone on the distribution list automatically. There is also a <span class="ui">Send to the governing body</span> button, which names exactly who it will reach before you press it.</p>
<div class="note">
  <span class="lbl">Use the button if you signed on paper</span>
  <p>Minutes closed by uploading a scan never pass through the electronic signing step, so nothing sends them automatically. The button is how those reach the ${body}, and how to send again if an address bounced.</p>
</div>
<div class="careful">
  <span class="lbl">Signed minutes cannot be edited</span>
  <p>Once every signature is in, the record is closed. Correct anything in the next set of minutes. That is what makes a signature worth having.</p>
</div>`,
    },
    {
      title: "Action items",
      html: `
<p class="lede">The register of who agreed to do what, by when.</p>
<p><span class="ui">Action Items</span> is one grid of everything outstanding, with an owner, a date and how far along it is. Anybody who signs in can see it, because somebody who cannot see their own action cannot act on it.</p>
<h3>Raising one from the minutes</h3>
<p>This is the way to do it. Open the minutes and use <span class="ui">Raise an action</span>, or pick the item it came out of. The heading and the minuted wording carry across, so you edit rather than retype what the meeting agreed.</p>
<p>The action then shows which meeting agreed it and links back. The minutes list every action that came out of them. Neither list can drift away from the other.</p>
<div class="note">
  <span class="lbl">Signed minutes are the best place to raise actions from</span>
  <p>Raising one changes nothing about the minutes, and a signed record is the most authoritative statement of what was agreed.</p>
</div>
<h3>Chasing them</h3>
<p>The portal emails a reminder a set number of days before the due date and can repeat it until the action is closed. You choose who gets chased. Nobody has to remember to nag.</p>`,
    },
    {
      title: "People, users and tags",
      html: `
<p class="lede">Three different things that are easy to confuse.</p>
<ul>
  <li>A <strong>person</strong> is on the ${body} register. They hold a position and have an email address. They may have no login at all.</li>
  <li>A <strong>user</strong> can sign in to the portal.</li>
  <li>A <strong>tag</strong> names a group of people, and is what decides who approves spend and who receives which minutes.</li>
</ul>
<p>A tag can sit on a person or on a user, so somebody with no login can still receive the minutes. Tags are set under <span class="ui">Admin</span>, <span class="ui">Tags</span>, and applied from <span class="ui">Admin</span>, <span class="ui">People</span> or <span class="ui">Users</span>.</p>
<div class="careful">
  <span class="lbl">Set your minutes tags up before the first meeting</span>
  <p>Under <span class="ui">Admin</span>, <span class="ui">Minutes Admin</span>, say which tag checks a draft, which signs, and who receives signed minutes. Sending a draft or opening signing will refuse until those exist, and name the setting to fix rather than sending into a void.</p>
</div>`,
    },
    {
      title: "Making it look like your school",
      html: `
<p class="lede">Your crest, your colours, your letterhead.</p>
<p>Under <span class="ui">Admin</span>, <span class="ui">School Branding</span>:</p>
<ul>
  <li><strong>Your crest</strong>, which appears on the sign in page, in the sidebar and on every email the portal sends.</li>
  <li><strong>Two colours</strong>, a main and an accent. Everything else is worked out from them, including making sure text stays readable on your main colour.</li>
  <li><strong>A reply address</strong>, so somebody replying to a portal email reaches a mailbox a person reads.</li>
  <li><strong>Your Word letterhead</strong>, used for minutes. Upload your own .docx with a <span class="ui">{{content}}</span> marker where the minutes should go.</li>
</ul>
<div class="note">
  <span class="lbl">Until you upload a crest</span>
  <p>The portal shows a plain mark rather than guessing. It will never show another school's badge.</p>
</div>`,
    },
    {
      title: "Emails the portal sends",
      html: `
<p class="lede">Everything the portal sends on the school's behalf.</p>
<div class="tw">
<table>
  <thead><tr><th>Email</th><th>Goes to</th><th>When</th></tr></thead>
  <tbody>
    <tr><td>Welcome</td><td>A new user</td><td>Their account is created</td></tr>
    <tr><td>Set your password</td><td>A user</td><td>They use Forgot password, or an administrator sends a link</td></tr>
    <tr><td>Approval needed</td><td>Each required approver</td><td>A funding request is submitted</td></tr>
    <tr><td>Decision recorded</td><td>The applicant</td><td>Each approver decides</td></tr>
    <tr><td>Minutes to check</td><td>Everyone on the draft list</td><td>A draft is sent for checking</td></tr>
    <tr><td>Changes requested</td><td>The secretary</td><td>A reviewer sends a draft back</td></tr>
    <tr><td>Your signing code</td><td>Each signatory</td><td>Signing opens, or a code is sent again</td></tr>
    <tr><td>Signed minutes</td><td>The ${body}</td><td>The last signature lands, or somebody sends them by hand</td></tr>
    <tr><td>Action assigned</td><td>The people assigned</td><td>An action is raised or reassigned</td></tr>
    <tr><td>Action reminder</td><td>Whoever the action chases</td><td>Before the due date, then repeating</td></tr>
  </tbody>
</table>
</div>
<div class="careful">
  <span class="lbl">Replies do not reach us by default</span>
  <p>Portal email is sent from an address that does not receive mail. Set a <strong>reply address</strong> under <span class="ui">Admin</span>, <span class="ui">School Branding</span> so a reply reaches somebody at ${esc(school)}.</p>
</div>`,
    },
  ];
}

/**
 * The standard guide, built for one school.
 *
 * A complete standalone HTML document, because that is what the Guide page
 * renders: it is handed to a sandboxed iframe, so it has to bring its own
 * stylesheet rather than inherit the portal's.
 */
export function buildDefaultGuide(branding: SchoolBranding): string {
  const school = branding.fullName;
  const body = GOVERNANCE_LABEL;
  const primary = branding.colors.primary;
  const dark = branding.colors.dark;
  const list = chapters(school, body);

  const contents = list
    .map(
      (c, i) =>
        `<li><a href="#ch${String(i + 1).padStart(2, "0")}"><span class="n">${String(
          i + 1
        ).padStart(2, "0")}</span><span class="t">${esc(c.title)}</span></a></li>`
    )
    .join("");

  const sections = list
    .map(
      (c, i) => `
<section class="chapter" id="ch${String(i + 1).padStart(2, "0")}">
  <div class="chead">
    <span class="num">Chapter ${String(i + 1).padStart(2, "0")}</span>
    <h2>${esc(c.title)}</h2>
  </div>
  ${c.html}
</section>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(school)} Portal Guide</title>
<style>
  :root { --primary: ${primary}; --dark: ${dark}; --ink: #1a1a1a; --soft: #666; --rule: #e5e5e5; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.65 Inter, -apple-system, Segoe UI, Roboto, sans-serif; color: var(--ink); background: #fff; }
  .masthead { background: var(--dark); color: #fff; padding: 48px 32px; }
  .masthead-in { max-width: 820px; margin: 0 auto; }
  .crest { margin: 0 0 8px; font-size: 13px; letter-spacing: .18em; text-transform: uppercase; opacity: .7; }
  .masthead h1 { margin: 0 0 12px; font-size: 34px; line-height: 1.15; }
  .standfirst { margin: 0; opacity: .85; max-width: 60ch; }
  .stamp { margin-top: 24px; display: flex; flex-wrap: wrap; gap: 20px; font-size: 13px; opacity: .75; }
  .shell { max-width: 1100px; margin: 0 auto; display: flex; gap: 40px; padding: 40px 32px 80px; align-items: flex-start; }
  .rail { position: sticky; top: 24px; width: 250px; flex-shrink: 0; }
  .rail h2 { font-size: 12px; letter-spacing: .16em; text-transform: uppercase; color: var(--soft); margin: 0 0 12px; }
  .rail ol { list-style: none; margin: 0; padding: 0; }
  .rail a { display: flex; gap: 10px; padding: 6px 0; text-decoration: none; color: var(--ink); font-size: 14px; border-bottom: 1px solid var(--rule); }
  .rail a:hover { color: var(--primary); }
  .rail .n { color: var(--soft); font-variant-numeric: tabular-nums; }
  main { flex: 1; min-width: 0; }
  .chapter { padding-bottom: 40px; margin-bottom: 40px; border-bottom: 1px solid var(--rule); }
  .chapter:last-child { border-bottom: 0; }
  .chead .num { font-size: 12px; letter-spacing: .16em; text-transform: uppercase; color: var(--primary); }
  .chead h2 { margin: 6px 0 16px; font-size: 26px; }
  .lede { font-size: 18px; color: #333; }
  h3 { margin: 28px 0 8px; font-size: 17px; }
  .ui { background: #f2f2f2; border: 1px solid var(--rule); border-radius: 4px; padding: 1px 6px; font-size: 14px; white-space: nowrap; }
  .steps { padding-left: 20px; } .steps li { margin: 8px 0; }
  ul li { margin: 6px 0; }
  .note, .careful { border-radius: 8px; padding: 14px 16px; margin: 20px 0; }
  .note { background: #f6f8fa; border-left: 3px solid var(--primary); }
  .careful { background: #fff8f1; border-left: 3px solid #d97706; }
  .lbl { display: block; font-weight: 600; font-size: 14px; margin-bottom: 4px; }
  .note p, .careful p { margin: 0; font-size: 15px; }
  .tw { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 15px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--rule); vertical-align: top; }
  th { color: var(--soft); font-size: 13px; text-transform: uppercase; letter-spacing: .06em; }
  @media print { .rail { display: none; } .shell { display: block; } .chapter { break-inside: avoid; } }
  @media (max-width: 820px) { .shell { flex-direction: column; } .rail { position: static; width: auto; } }
</style>
</head>
<body>
<header class="masthead">
  <div class="masthead-in">
    <p class="crest">${esc(school)} · ${body}</p>
    <h1>Portal Guide</h1>
    <p class="standfirst">How to use the portal: where the policies live, how a policy is checked against the law, how money gets requested and approved, and how a meeting's minutes are written, checked, signed and turned into actions. Written for governors, not for computer people.</p>
    <div class="stamp">
      <span><b>Edition</b> Standard</span>
      <span><b>Covers</b> ${list.length} chapters</span>
    </div>
  </div>
</header>
<div class="shell">
  <nav class="rail" aria-label="Contents"><h2>Contents</h2><ol>${contents}</ol></nav>
  <main>${sections}</main>
</div>
</body>
</html>`;
}
