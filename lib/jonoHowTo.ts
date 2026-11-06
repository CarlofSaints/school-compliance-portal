import { GUIDE_TEXT } from "./guideText";
import { CHAPTER_VIDEOS } from "./defaultGuide";

// ---------------------------------------------------------------------------
// What Ask Jono knows about USING the portal. Carl: "ask something like 'How do
// I tag users?' or 'How do I create a new minutes template' ... and Jono can
// guide me".
//
// Built from the portal's own Guide (lib/guideText/en.ts, the same words the
// Guide page shows) plus the clips for each page, and a short list of features
// newer than the Guide. 🔴 When a feature ships, add a line to NEWER_THAN_GUIDE
// (or a Guide chapter), or Jono will not know it exists.
// ---------------------------------------------------------------------------

export const NEWER_THAN_GUIDE = `
- Staff (teachers and coaches): Admin, Staff. Press "+ Add staff member" for one person, or "Download template", fill it in and press "Upload Excel" for many. If something is wrong with a row the load stops and says what; fix it, or tick "Ignore invalid items" to load everyone else. Create the role first on Admin, Roles. "Email login links" emails each new person a link to set their password. The Users and People pages have a role filter.
- Tag people on a minutes section: under the section heading, "People:" row, "+ Tag person". Tag who said something: select the words, then "Tag person" in the text toolbar; "Untag" removes it. Tagged people's initials print in the Word file's Responsible column.
- Format minutes like Word: each section has a toolbar (bold, italic, underline, strikethrough, font, size, text colour, highlight, bullets, numbering, heading, table with add/remove rows and columns, picture, clear formatting). Tables and screenshots can be pasted straight in from Word. Minutes save as you type.
- Meeting types (SGB / Board, FINCOM, Other, or your own such as AGM): Admin, Minutes Admin, "Meeting types" tab. Add a type at the bottom; rename any type and press "Save name"; types you added can be removed while no minutes or templates use them.
- Who receives minutes, per meeting type: Admin, Minutes Admin, "Who receives minutes" tab. Pick the meeting type, then set the tag for each stage: 1 Draft, out for checking; 2 Ready to sign (who signs, each gets a code and a signature space); 3 Signed and final (who gets the signed minutes). Press "Save for" (followed by the type's name).
- Who can read minutes: Admin, Minutes Admin, "Who can read minutes" tab, one card per meeting type.
- Minutes templates: Admin, Minutes Admin, "Templates" tab, "Create minutes template".
- Signature spaces: everyone carrying the tag chosen under "Ready to sign" for that meeting type gets one when the minutes are sent for signing ("Send out for signing" on the minutes).
- Signed on paper: on minutes out for signing, "Signed on paper", tick who signed the printed copy, "Record paper signatures", then optionally upload the signed scan. A minutes admin or the Principal can tick other people; anyone else only themselves.
- Action items from minutes: "+ Add to action items" under a section, or "Raise an action" in "Actions from this meeting". Delete one there with "Delete". Emails about them go out only once the minutes are signed, one email per person; reminders come separately.
- Action Items page filters: Show (Open, Mine, Overdue...), Progress, the search box and the person dropdown (Everyone, a person, Nobody assigned).
- Payment Approvals (invoice checks): Payment Approvals in the sidebar. Contacts: "Add a contact", choose creditor or debtor; a creditor needs bank details; proof is optional, but the inbox shows an orange "No bank proof loaded" until it is added. Invoice Inbox: drop one or many invoices under "1. Load invoices", then drop or paste (Ctrl+V) the bank's payment notice under "2. Load the bank payment notice". Bank Details Match and Amount Match show a green tick (match), red X (no match) or grey question mark (nothing to compare); hover for the reason. Difference shows the Rand gap. People sign the payment notice, not each invoice, so one notice covering many payments is signed once: under Bank payment notices press "Sign", check the payments, press "Email me a code", draw or type the signature, enter the code. Each person's signature lands on their own line of the stamp. Signed Notice has View and Download: the notice with our stamp on it. Under "3. Load the bank statement", drop a statement: an invoice becomes Paid when a payment for its exact amount is on it. Status runs Pending approval (checks not both green), Pending signatures, "1 of 3 have signed", "1 of 3 have approved", Paid; the names of who has signed and who is still waited on show beside it. After signing, tick Approved at bank once you have approved it at the bank. Who signs: the tags ticked under "Who signs the payment notice" at the bottom of the Invoice Inbox; each ticked tag is one line on the stamp. Permissions: View Invoice Inbox, Load Invoices and Manage Contacts. Reading a file uses credits.
- Section 38A (paying state-paid staff extra, public schools only): Section 38A in the sidebar, needs the Manage Section 38A Applications permission. Choose the budget year, fill in Setup, "Add a person" for each payment, "Send to sign" emails each employee a link (no login). Fill in SGB approval and send to the two chairs, whose tags are chosen in Setup. "Download pack" gives the form, "Mark as lodged" locks the list, then upload the Head of Department's letter and record each decision. It uses the draft national Form 1, so check with the district first.
- Campus (training): Campus in the sidebar for courses and the leaderboard; "Manage Campus" (needs the Manage Campus permission) to add courses from the library, build one with AI, share a link or send by email.
- Compile a policy from scratch: Policies, "Compile a policy from scratch". It uses the school's credits (Admin, Translation Credits).
- SGB or board of governors term: Admin, "SGB or Board Term": set the start and end dates; at the end members are locked out until switched back on.
- New user: Admin, Users, "Create User". To also put them on the register: Admin, People & Positions, "Add Person" (or "Add them to the People register" on the Users page).
- New tag: Admin, Tags, "New tag". Give people the tag on Admin, People & Positions (or on their user).
- Something missing from the menu is a permission: an administrator grants it under Admin, Roles.
`;

export const stripGuideHtml = (html: string) =>
  html
    .replace(/<li>/g, "\n- ")
    .replace(/<\/(p|div|h\d|ol|ul)>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/^[ \t]+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** The Guide as plain text, each chapter with its how-to clips, then the newer features. */
export function portalHowTo(schoolName: string, body: "SGB" | "Board", origin: string): string {
  const chapters = GUIDE_TEXT.en.chapters(schoolName, body);
  const parts = chapters.map((c, i) => {
    const clips = CHAPTER_VIDEOS[i]?.[1] ?? [];
    const videos = clips.length ? `\nVideos: ${clips.map(([id, label]) => `${label}: ${origin}/tutorials/${id}.mp4`).join("; ")}` : "";
    return `## ${c.title}\n${stripGuideHtml(c.html)}${videos}`;
  });
  return `${parts.join("\n\n")}\n\n## Newer features (not yet in the Guide)\n${NEWER_THAN_GUIDE.trim()}`;
}
