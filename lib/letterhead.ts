// ---------------------------------------------------------------------------
// The school's own Word letterhead.
//
// Carl: "put it in /admin/branding so we can use it for other things if
// needed." So it sits with the crest and the colours, at BRANDING level, not
// under minutes: a school has one letterhead, and the next document type we
// generate should use the same one rather than asking for it again.
//
// ⚠️ Not a MINUTES TEMPLATE (lib/minutesTemplates.ts), which is the reusable
// set of SECTIONS a secretary picks from. This is the paper.
//
// 🔴 How it works: we do NOT parse or rebuild the school's layout. Their file
// is patched at its {{content}} marker and every other part of it is left
// exactly as it was, which is what keeps their crest, fonts, header, footer and
// governing-body table intact.
//
// PURE. No storage, no @vercel/blob, no next/headers, so the admin screen can
// import the marker list. 🔴 Fourth time in this project a client component
// importing a data module has dragged the Blob SDK into the browser bundle and
// broken the build; the split is the fix that sticks.
// ---------------------------------------------------------------------------

/** The one placeholder a letterhead must contain. Everything else is optional
 *  and a letterhead that omits it simply keeps its own wording there. */
export const REQUIRED_PLACEHOLDER = "content";

/** What a school may use, and what each one is replaced with. Shown on the
 *  admin screen, so the list a person reads and the list the builder honours
 *  cannot drift apart. */
export const PLACEHOLDERS: { name: string; what: string }[] = [
  { name: "content", what: "The numbered table of items. Required." },
  { name: "title", what: "The name of the meeting, e.g. SGB meeting, 7 May 2026." },
  { name: "period", what: "The period, e.g. May 2026 or Q2 2026." },
  { name: "meeting", what: "SGB or FINCOM." },
  { name: "school", what: "The school's full name." },
  { name: "draft", what: 'e.g. DRAFT 2. Empty once signed.' },
  {
    name: "governors",
    // ⚠️ Says "as it stands today" on purpose. It is drawn from the People
    // register at the moment the file is built, so re-downloading last year's
    // minutes shows this year's governing body. That is the right behaviour for
    // LETTERHEAD - stationery describes the school now - but a school that
    // needs the historical list on old minutes should keep typing it by hand.
    // Saying so here is what lets somebody choose knowingly.
    what: "A table of governing body positions and who holds them, as it stands today. Leave it out and your own typed table is kept.",
  },
];

