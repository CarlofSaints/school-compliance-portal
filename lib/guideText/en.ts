import type { GuideText } from "./types";

// 🔴 The SOURCE text of the standard guide. Every other language file is a
// translation of this one: change a chapter here and change it in all six
// (af, zu, xh, nso, tn, st) in the same commit, or readers of those languages
// get an older guide than English readers.
export const en: GuideText = {
  title: "Portal Guide",
  standfirst:
    "How to use the portal: where the policies live, how a policy is checked against the law, how money gets requested and approved, how a meeting's minutes are written, checked, signed and turned into actions, and how rooms are booked. Written for governors, not for computer people.",
  chapter: "Chapter",
  contents: "Contents",
  edition: "Edition",
  standard: "Standard",
  covers: (n) => `Covers ${n} chapters`,
  chapters: (school, body) => [
    {
      title: "Getting in",
      html: `
<p class="lede">Everyone who uses the portal has their own login. There is no shared password.</p>
<ol class="steps">
  <li>Go to your school's portal address and sign in with your email address.</li>
  <li>First time here, or forgotten it? Use <span class="ui">Forgot your password?</span> on the sign in page. A link arrives by email and is good for about an hour.</li>
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
  <li><strong>People</strong> is the ${body} register: who holds which position right now.</li>
  <li><strong>Action Items</strong> is who agreed to do what, by when.</li>
  <li><strong>Meeting Minutes</strong> is where minutes are written, checked and signed.</li>
  <li><strong>Guide</strong> is this document.</li>
  <li><strong>Policies</strong>, <strong>Compliance</strong> and <strong>Documents</strong> hold the governance documents and the checks run against them.</li>
  <li><strong>Spend</strong> is funding applications, quotes, approvals and the budget reports.</li>
  <li><strong>Rooms</strong> is the meeting room calendar.</li>
  <li><strong>Admin</strong> is everything that is set up once: users, roles, tags, branding, emails and settings.</li>
</ul>
<p>If a page you expect is missing, it is a permission rather than a fault. An administrator can grant it under <span class="ui">Admin</span>, <span class="ui">Roles</span>.</p>`,
    },
    {
      title: "Reading the portal in your language",
      html: `
<p class="lede">The portal speaks seven languages: English, Afrikaans, isiZulu, isiXhosa, Sepedi, Setswana and Sesotho.</p>
<p>Pick your language in the box at the top right of any page, even the sign in page. Every button, label, message and this guide change straight away, and the portal remembers your choice on that device. This costs nothing.</p>
<h3>Your school's own documents</h3>
<p>A policy or a set of minutes was written by your school, so no dictionary knows it in advance. Those are translated on request and paid for with translation credits.</p>
<ul>
  <li>Credits cost R100 for 10 and never expire. Order them under <span class="ui">Admin</span>, <span class="ui">Translation Credits</span>.</li>
  <li>One credit translates up to 10 pages of one document into one language.</li>
  <li>Once a document is translated, everybody at your school reads it in that language for free.</li>
</ul>
<div class="note">
  <span class="lbl">Who may spend credits</span>
  <p>Nobody can spend credits until an administrator ticks <span class="ui">Can spend translation credits</span> on that person under <span class="ui">Admin</span>, <span class="ui">Users</span>.</p>
</div>`,
    },
    {
      title: "Our People",
      html: `
<p class="lede">Who sits on your ${body} right now, and in which position.</p>
<p><span class="ui">People</span> shows everyone on the register as a card with their position and email address, and you can search by name or position. It is the answer to "who is our treasurer this year?"</p>
<ol class="steps">
  <li>Keep it current under <span class="ui">Admin</span>, <span class="ui">People &amp; Positions</span>. Update it the day somebody joins or leaves.</li>
  <li>The list of positions, and the order the page reads in, is set under <span class="ui">Admin</span>, <span class="ui">People Types</span>.</li>
</ol>
<div class="note">
  <span class="lbl">A person does not need a login</span>
  <p>Somebody on the register can receive minutes and reminders by email without ever signing in. Give them a login only if they need to use the portal.</p>
</div>`,
    },
    {
      title: "Policies",
      html: `
<p class="lede">Every governance policy in one place, with its full history.</p>
<p>Upload a policy and the portal keeps it with a version history, so the copy the ${body} approved in March is still there after it is revised in September. Nothing is overwritten and nothing is lost.</p>
<ol class="steps">
  <li><span class="ui">Policies</span>, then <span class="ui">Upload Policy</span>.</li>
  <li>Give it a name a person would search for, not a filename, and choose a category.</li>
  <li>Replacing an existing policy adds a version rather than a second policy.</li>
</ol>
<p>The categories (Finance, Governance, Safety and so on) are yours to change under <span class="ui">Admin</span>, <span class="ui">Policy Categories</span>.</p>`,
    },
    {
      title: "Running a compliance check",
      html: `
<p class="lede">Upload a document and get a compliance score against South African education law, with the gaps listed one by one.</p>
<p>Checks run against the <strong>BELA Act</strong>, <strong>SASA</strong> and provincial regulation. You get a score, and underneath it the specific gaps found: a delegation not recorded, a missing annual resolution, a code of conduct that is out of date.</p>
<ul>
  <li>Check a policy straight from its page with <span class="ui">Run Compliance Check</span>, or upload any file under <span class="ui">Compliance</span>, <span class="ui">Run Check</span>.</li>
  <li>Documents that are not policies, such as a contract or a plan, go under <span class="ui">Documents</span> and are checked the same way.</li>
</ul>
<h3>Your own guidelines</h3>
<p>Under <span class="ui">Compliance</span>, <span class="ui">Guidelines</span> you can upload the rules a check should also measure against: a provincial circular, or for an independent school, your own board's rules. Every check after that takes them into account.</p>
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
<p>Under <span class="ui">Admin</span>, <span class="ui">Approval Settings</span>, amount bands are matched to groups of people. Under one figure a request is only logged; over another it goes to the finance committee. Set the bands once and every application after that routes itself.</p>
<div class="careful">
  <span class="lbl">Approvers are FROZEN when a request is submitted</span>
  <p>Whoever was required at the moment it was submitted stays required. A committee that gains a member next week does not re-open an application that has already been decided.</p>
</div>
<p>Approvers are named people carried on a <strong>tag</strong>, not a job title, because approval authority belongs to a person rather than to a role.</p>`,
    },
    {
      title: "The budget and spend reports",
      html: `
<p class="lede">How much the ${body} set aside, how much is promised, and how much is spent.</p>
<p>Under <span class="ui">Admin</span>, <span class="ui">Spend Settings</span>, set the budget year, the total CAPEX budget and the month your financial year ends. The sources of funds (CAPEX, fundraising and so on) are listed there too, and you can add your own.</p>
<p><span class="ui">Spend</span>, <span class="ui">Reports</span> then shows:</p>
<ul>
  <li><strong>Budget against spend:</strong> the budget, what is committed (approved) and what is actually spent (completed).</li>
  <li><strong>Each source of funds:</strong> requested, committed and spent.</li>
  <li><strong>Each project:</strong> who asked, how much, the quotes, the supplier and how far along it is.</li>
</ul>
<p><span class="ui">Export to Excel</span> gives the treasurer the same figures as a spreadsheet.</p>`,
    },
    {
      title: "Writing the minutes",
      html: `
<p class="lede">Where a meeting's record is written, and what makes it the school's own document.</p>
<p>Open <span class="ui">Meeting Minutes</span> and choose <span class="ui">Add minutes</span>. There are two ways in and both end in the same place.</p>
<h3>Starting from a template</h3>
<p>A template is the shape of a meeting: the sections your ${body} always covers, in order, with the standing wording already filled in. The attendance list barely changes, so it lives on the template and gets edited rather than retyped. Templates are built under <span class="ui">Admin</span>, <span class="ui">Minutes Admin</span>.</p>
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
<h3>The Word document</h3>
<p><span class="ui">Download as Word</span> produces the document to print or circulate. Your school's crest sits at the top, and the minutes follow in a numbered table that fits the page.</p>`,
    },
    {
      title: "Sending a draft out for checking",
      html: `
<p class="lede">Before anyone signs, the draft goes to the people who check it.</p>
<p>Press <span class="ui">Send draft 1 for checking</span> (the number is the draft you are on). Everyone on the school's draft list is emailed a link, opens the minutes, and either approves them or sends them back.</p>
<ul>
  <li><strong>Approve</strong> says the draft is a fair record of the meeting.</li>
  <li><strong>Send it back</strong> asks for changes and <strong>requires a note</strong>. Without one the secretary is only told somebody is unhappy.</li>
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
<p>The portal emails a reminder a set number of days before the due date and can repeat it until the action is closed. You choose who gets chased. Nobody has to remember to nag.</p>
<p>The categories an action can be filed under are set under <span class="ui">Admin</span>, <span class="ui">Action Categories</span>.</p>`,
    },
    {
      title: "Booking a meeting room",
      html: `
<p class="lede">The boardroom and the hall on one shared calendar, so two meetings never land in the same room.</p>
<ol class="steps">
  <li>An administrator adds the rooms once under <span class="ui">Rooms</span>, <span class="ui">Meeting Rooms</span>.</li>
  <li>Open <span class="ui">Rooms</span>, <span class="ui">Bookings</span>, pick a room, and click a free slot on the week calendar.</li>
  <li>Give the meeting a name and a time. You can book on somebody else's behalf.</li>
</ol>
<ul>
  <li><strong>Clashes are caught</strong> before they happen: a slot that is taken cannot be booked twice.</li>
  <li><strong>Repeat a booking</strong> daily, weekly or monthly, up to 52 times. Change one meeting in the series, or cancel this one and every one after it. Past meetings are kept.</li>
  <li><strong>Reminders</strong> go by email at 07:00 on the day of the meeting. A meeting before 08:00 is reminded the morning before.</li>
</ul>
<h3>Need a room somebody already has?</h3>
<p>Click their booking and ask for it, with a reason. They get an email and decide. Nothing changes unless they say yes.</p>
<div class="note">
  <span class="lbl">Cannot see Rooms?</span>
  <p>Booking and managing rooms are permissions. An administrator ticks them under <span class="ui">Admin</span>, <span class="ui">Roles</span>.</p>
</div>`,
    },
    {
      title: "Keeping everyone informed",
      html: `
<p class="lede">Two emails that do the chasing for you.</p>
<h3>The weekly update</h3>
<p>Under <span class="ui">Admin</span>, <span class="ui">Weekly Update</span>: one email a week to every portal user, with open action items, spend waiting for approval, who has not signed in yet, and minutes still waiting for signatures. Choose the day and time, tick <span class="ui">Send the weekly update automatically</span> and save. Nothing is sent until you do.</p>
<h3>The action items summary</h3>
<p>Under <span class="ui">Admin</span>, <span class="ui">Action Summary Email</span>: the full open register as an Excel workbook, on a schedule you choose, to the people and tags you pick. A tag is looked up on every send, so somebody tagged next month is on the next one.</p>
<div class="note">
  <span class="lbl">Try it on yourself first</span>
  <p>Both pages let you email a preview to yourself before anything goes to the whole ${body}.</p>
</div>`,
    },
    {
      title: "People, users and tags",
      html: `
<p class="lede">Three different things that are easy to confuse.</p>
<ul>
  <li>A <strong>person</strong> is on the ${body} register. They hold a position and have an email address. They may have no login at all.</li>
  <li>A <strong>user</strong> can sign in to the portal. What they can do is set by their <strong>role</strong>, under <span class="ui">Admin</span>, <span class="ui">Roles</span>.</li>
  <li>A <strong>tag</strong> names a group of people, and is what decides who approves spend and who receives which minutes.</li>
</ul>
<p>A tag can sit on a person or on a user, so somebody with no login can still receive the minutes. Tags are set under <span class="ui">Admin</span>, <span class="ui">Tags</span>, and applied from <span class="ui">Admin</span>, <span class="ui">People &amp; Positions</span> or <span class="ui">Users</span>.</p>
<div class="careful">
  <span class="lbl">Set your minutes tags up before the first meeting</span>
  <p>Under <span class="ui">Admin</span>, <span class="ui">Minutes Admin</span>, say which tag checks a draft, which signs, and who receives signed minutes. Sending a draft or opening signing will refuse until those exist, and name the setting to fix rather than sending into a void.</p>
</div>`,
    },
    {
      title: "Making it look like your school",
      html: `
<p class="lede">Your crest and your colours.</p>
<p>Under <span class="ui">Admin</span>, <span class="ui">School Branding</span>:</p>
<ul>
  <li><strong>Your crest</strong>, which appears on the sign in page, in the sidebar, on every email the portal sends and at the top of your Word minutes.</li>
  <li><strong>Two colours</strong>, a main and an accent. Everything else is worked out from them, including making sure text stays readable on your main colour.</li>
  <li><strong>A reply address</strong>, so somebody replying to a portal email reaches a mailbox a person reads.</li>
</ul>
<div class="note">
  <span class="lbl">Until you upload a crest</span>
  <p>The portal shows a plain mark rather than guessing. It will never show another school's badge.</p>
</div>`,
    },
    {
      title: "Keeping a record",
      html: `
<p class="lede">What happened, what was sent, and a copy of everything.</p>
<ul>
  <li><strong>Activity Log</strong> lists every action taken in the portal, who took it and when, including sign-ins. It is the record an auditor asks for.</li>
  <li><strong>Sent Emails</strong> lists every email the portal sent, who it went to and whether it was accepted. Codes and private links are blanked out.</li>
  <li><strong>Backup Data</strong> downloads a complete copy of your school's data as a ZIP file: users, policies, documents, checks, spend and settings.</li>
</ul>
<div class="note">
  <span class="lbl">Someone says they never got an email?</span>
  <p>Look them up in <span class="ui">Sent Emails</span> first. If it was accepted, it reached their mail system, so ask them to check the junk folder.</p>
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
    <tr><td>Room booked or changed</td><td>The person the room is booked for</td><td>A booking is made, changed or cancelled</td></tr>
    <tr><td>Room reminder</td><td>The person the room is booked for</td><td>07:00 on the day of the meeting</td></tr>
    <tr><td>Can they have the room?</td><td>Whoever has the booking</td><td>Somebody asks for their slot</td></tr>
    <tr><td>Weekly update</td><td>Every portal user</td><td>The day and time you chose</td></tr>
    <tr><td>Action items summary</td><td>The people and tags you chose</td><td>The schedule you chose</td></tr>
  </tbody>
</table>
</div>
<div class="careful">
  <span class="lbl">Replies do not reach us by default</span>
  <p>Portal email is sent from an address that does not receive mail. Set a <strong>reply address</strong> under <span class="ui">Admin</span>, <span class="ui">School Branding</span> so a reply reaches somebody at ${school}.</p>
</div>`,
    },
  ],
};
