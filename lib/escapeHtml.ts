// Titles, descriptions and notes are typed by people, and an apostrophe or an
// angle bracket in a title should not be able to break the layout of the mail.
// Every value a person typed, in every template, goes through this. Its own
// file: the email templates and the sent box both use it, and email.ts
// already imports sentEmails.ts.
export function esc(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
