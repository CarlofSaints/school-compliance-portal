// PURE meeting-minutes types and period logic.
//
// No storage, no @vercel/blob, no next/headers, so a client component can
// import it. Same split as lib/actionItems.ts vs lib/actionItemData.ts.

export type MeetingBody = "sgb" | "fincom" | "other";

export const MEETING_BODY_LABELS: Record<MeetingBody, string> = {
  sgb: "SGB",
  fincom: "FINCOM",
  other: "Other",
};

/**
 * How a set of minutes is dated.
 *
 * Carl asked for "year + month or year + quarter or year AND custom period the
 * user can select". Modelled as a tagged union rather than three nullable
 * fields, so a set of minutes cannot be a quarter and a month at once, and
 * every place that formats a period has to handle all three.
 */
export type MeetingPeriod =
  | { kind: "month"; year: number; month: number } // month is 1-12
  | { kind: "quarter"; year: number; quarter: 1 | 2 | 3 | 4 }
  | { kind: "custom"; year: number; from: string; to: string; label?: string };

export type MinutesStatus =
  | "draft" // being written or uploaded, nobody has been asked yet
  | "in_review" // sent to the Principal and Chair to check
  | "changes_requested" // somebody declined with comments
  | "awaiting_signatures" // approved, out for signing
  | "signed" // everyone has signed. LOCKED.
  | "archived";

export const MINUTES_STATUS_LABELS: Record<MinutesStatus, string> = {
  draft: "Draft",
  in_review: "Out for checking",
  changes_requested: "Changes requested",
  awaiting_signatures: "Awaiting signatures",
  signed: "Signed",
  archived: "Archived",
};

/** 🔴 Once signed, minutes are a record of what a governing body agreed and
 *  cannot be edited. Everything that writes must ask this first. */
export function isLocked(status: MinutesStatus): boolean {
  return status === "signed" || status === "archived";
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatPeriod(p: MeetingPeriod): string {
  switch (p.kind) {
    case "month":
      return `${MONTHS[p.month - 1] ?? "?"} ${p.year}`;
    case "quarter":
      return `Q${p.quarter} ${p.year}`;
    case "custom":
      return p.label?.trim() || `${p.from} to ${p.to}`;
  }
}

/** Sortable key, so a list of minutes orders correctly whichever kind of period
 *  each one uses. Quarters sort to the START of their first month, which puts a
 *  quarter ahead of the months inside it rather than interleaved oddly. */
export function periodSortKey(p: MeetingPeriod): string {
  switch (p.kind) {
    case "month":
      return `${p.year}-${String(p.month).padStart(2, "0")}-00`;
    case "quarter":
      return `${p.year}-${String((p.quarter - 1) * 3 + 1).padStart(2, "0")}-00`;
    case "custom":
      return `${p.year}-${p.from.slice(5) || "00-00"}`;
  }
}

export type PeriodProblem = string | null;

/** Validates a period. Returns a sentence for a person, or null if it is fine. */
export function checkPeriod(p: MeetingPeriod): PeriodProblem {
  const thisYear = new Date().getFullYear();
  if (!Number.isInteger(p.year) || p.year < 2000 || p.year > thisYear + 5) {
    return `The year should be between 2000 and ${thisYear + 5}.`;
  }
  if (p.kind === "month") {
    if (!Number.isInteger(p.month) || p.month < 1 || p.month > 12) {
      return "Choose a month.";
    }
    return null;
  }
  if (p.kind === "quarter") {
    if (![1, 2, 3, 4].includes(p.quarter)) return "Choose a quarter.";
    return null;
  }
  // Custom
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.from) || !/^\d{4}-\d{2}-\d{2}$/.test(p.to)) {
    return "Choose a start and end date.";
  }
  if (p.from > p.to) return "The start date is after the end date.";
  return null;
}

/** A section of the minutes: Finance report, Principal's Report, and so on.
 *  Admins add, edit and remove these freely, so they are DATA and never a
 *  hard-coded list. */
export interface MinutesSection {
  id: string;
  title: string;
  /** What was minuted. Plain text; the Word template supplies the styling. */
  body: string;
  order: number;
  /** 🔴 Numbering starts AT this section. Everything before it is unnumbered.
   *  Carl: the attendees are not a numbered item, so numbering usually starts
   *  at the second or third section. At most one section carries this. */
  numberingStartsHere?: boolean;
  /**
   * Column 3 of the Word table: who is responsible, as TEXT.
   *
   * 🔴 Frozen, not a live link. Seeded when the template is copied by
   * resolving its positions to whoever holds them THEN. If it pointed at a
   * position instead, last year's minutes would rename their own
   * participants every time a school elected a new chair, and a signed
   * record would change after it was signed.
   *
   * Free text, because a secretary writes "Kevin and Rob" or "Finance
   * subcommittee" as readily as one name.
   */
  responsible?: string;
}

/** The default set a new school starts with, so the first meeting is not a
 *  blank page. Every one of them is editable and deletable. */
export const DEFAULT_SECTIONS = [
  "Attendance and apologies",
  "Matters arising from the previous meeting",
  "Principal's report",
  "Finance report",
  "Grounds and maintenance",
  "Fundraising",
  "General",
] as const;

export type SignatoryRole = "sgb_chair" | "principal" | "deputy_chair" | "other";

export const SIGNATORY_ROLE_LABELS: Record<SignatoryRole, string> = {
  sgb_chair: "SGB Chair",
  principal: "Principal",
  deputy_chair: "Deputy Chair",
  other: "Other",
};

export interface Signatory {
  /** People-register id, so somebody with no login can still be a signatory. */
  personId: string;
  name: string;
  email: string;
  role: SignatoryRole;
  /** Set when they sign. Absent means still waiting. */
  signedAt?: string;
  /** 🔴 The document's SHA-256 AT THE MOMENT THEY SIGNED. This is what makes a
   *  homegrown signature defensible: it proves the thing signed is the thing
   *  being held now. Without it a signature is only a claim. */
  documentHash?: string;
  /** Recorded for the audit trail, never shown to other signatories. */
  ip?: string;
  /**
   * SHA-256 of the code emailed to this person, salted with the minutes id.
   *
   * 🔴 The plain code is never stored. Anyone who could read this store
   * could otherwise sign as every signatory, which would make the signature
   * worth nothing at exactly the moment it mattered.
   */
  codeHash?: string;
  /** When their code was sent, so a resend is visible and the secretary can
   *  see who has been chased. */
  codeSentAt?: string;
}

/** Signing is sequential in the sense that everyone must sign before the
 *  minutes close, but NOT in a fixed order: waiting for the Chair while the
 *  Principal is available just delays the record. */
export function signingProgress(signatories: Signatory[]): {
  signed: number;
  total: number;
  complete: boolean;
  waitingOn: string[];
} {
  const signed = signatories.filter((s) => s.signedAt).length;
  return {
    signed,
    total: signatories.length,
    complete: signatories.length > 0 && signed === signatories.length,
    waitingOn: signatories.filter((s) => !s.signedAt).map((s) => s.name),
  };
}

// ---------------------------------------------------------------------------
// Minutes TEMPLATES: the reusable shape of a meeting.
//
// ⚠️ Not the Word letterhead (LetterheadTemplate in lib/minutesData.ts), which
// is a .docx carrying the crest and footer. This is the section structure a
// secretary picks from when starting a new set of minutes.
//
// Pure, and here rather than in lib/minutesTemplates.ts, because the admin
// screen is a client component: importing them from the storage module pulled
// controlData into the browser bundle and broke the build.
// ---------------------------------------------------------------------------

export interface TemplateSection {
  id: string;
  title: string;
  /**
   * Content pre-filled into every set of minutes made from this template, and
   * editable per meeting afterwards.
   *
   * This is the point of the whole feature: the attendee list barely changes,
   * so it lives here and gets tweaked rather than retyped. Same for "Previous
   * minutes sign off".
   */
  staticContent?: string;
  /**
   * 🔴 POSITIONS, not people. "SGB Treasurer", not "Kevin James".
   *
   * Carl: "if we tag SGB Chair, then when the chair is gone and there is a
   * new chair, the template lives on and does not need editing." A template
   * outlives the people in it, so naming a person would mean editing every
   * template after every election.
   *
   * Resolved to whoever holds the position at the moment a set of minutes is
   * started, and frozen there.
   */
  positions?: string[];
  order: number;
  /** 🔴 Numbering starts AT this section; everything before it is unnumbered.
   *  Carried into the minutes when the template is copied. */
  numberingStartsHere?: boolean;
}

export interface MinutesTemplate {
  id: string;
  name: string;
  /** Which meeting this suits. Optional: a school may keep one general one. */
  body?: MeetingBody;
  description?: string;
  sections: TemplateSection[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

/**
 * Turns a template into the sections a new set of minutes starts with.
 *
 * The static content becomes the section's body, which is exactly the ask: the
 * attendees are already there and the secretary edits them for this meeting
 * rather than typing them out again.
 *
 * Positions ARE copied, resolved to names. The template says "SGB Treasurer";
 * the minutes say "Kevin James", frozen, because that is who was responsible at
 * that meeting and it must still say so after the next election.
 */
/** Turns a template's positions into the text for column 3. Unknown positions
 *  are kept as the position name itself, which is more useful than a blank:
 *  "SGB Treasurer" tells a reader who was responsible even when the seat is
 *  vacant. */
export function resolvePositions(
  positions: string[] | undefined,
  holders: Map<string, string>
): string | undefined {
  if (!positions?.length) return undefined;
  const names = positions.map((p) => holders.get(p) || p);
  return names.join(", ");
}

export function sectionsFromTemplate(
  template: MinutesTemplate,
  /** position -> the name of whoever holds it now. Absent leaves column 3
   *  blank, which the secretary can simply type into. */
  holders: Map<string, string> = new Map()
): MinutesSection[] {
  return [...template.sections]
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({
      id: crypto.randomUUID(),
      title: s.title,
      body: s.staticContent || "",
      order: i + 1,
      // Carried across, or numbering set in the template would be silently
      // lost the moment a secretary started a meeting from it.
      numberingStartsHere: s.numberingStartsHere,
      // The template names a POSITION; the minutes record the NAME of whoever
      // held it at this meeting. Resolved here, once, and frozen.
      responsible: resolvePositions(s.positions, holders),
    }));
}

/**
 * What a school gets before it has built any template of its own.
 *
 * Offered as a starting point in the admin screen rather than silently applied,
 * so a school sees a real template it can edit instead of wondering where the
 * sections came from.
 */
export const STARTER_TEMPLATE: Omit<TemplateSection, "id" | "order">[] = [
  {
    title: "Attendance and apologies",
    staticContent:
      "Present:\n\nApologies:\n\nIn attendance (non-members):",
  },
  {
    title: "Previous minutes sign off",
    staticContent:
      "The minutes of the previous meeting were tabled.\n\nProposed by:\nSeconded by:\nAccepted as a true reflection: yes / no",
  },
  { title: "Matters arising from the previous meeting" },
  { title: "Principal's report" },
  { title: "Finance report" },
  { title: "Grounds and maintenance" },
  { title: "Fundraising" },
  { title: "General" },
  {
    title: "Date of next meeting",
    staticContent: "Date:\nTime:\nVenue:",
  },
];

/**
 * The number shown against each section, or null for the unnumbered ones.
 *
 * Carl: "each section should be numbered so that when it renders in word, each
 * section is numbered sequentially... the user must be able to select the
 * section to start the numbering - the first section I add might be the
 * attendees etc. but that is not a numbered section."
 *
 * So numbering runs 1..n from whichever section is flagged, and everything
 * before it has no number at all.
 *
 * With NO section flagged, everything is numbered from 1. That is the sensible
 * default rather than numbering nothing: a school that never touches this still
 * gets numbered minutes, which is what the DoE expects to read.
 *
 * If more than one section is flagged the FIRST wins, because a second start
 * point would restart the count halfway down and produce two number 1s.
 */
export function sectionNumbers<T extends { id: string; order: number; numberingStartsHere?: boolean }>(
  sections: T[]
): Map<string, number | null> {
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  const startIndex = ordered.findIndex((s) => s.numberingStartsHere);
  // -1 means nobody flagged it, so start at the top.
  const from = startIndex === -1 ? 0 : startIndex;

  const out = new Map<string, number | null>();
  let n = 0;
  ordered.forEach((s, i) => {
    if (i < from) {
      out.set(s.id, null);
    } else {
      n += 1;
      out.set(s.id, n);
    }
  });
  return out;
}

/** The heading as it should read, e.g. "3. Finance report" or just
 *  "Attendance and apologies". One helper so the editor, the Word export and
 *  anything else cannot disagree about what a section is called. */
export function numberedTitle(title: string, number: number | null): string {
  return number === null ? title : `${number}. ${title}`;
}

// ---------------------------------------------------------------------------
// The review round trip: draft out for checking, back with comments, out again.
//
// Carl: the email "explains that this is draft 1, asks them to check it and
// then a link in the email directs them to the doc, so they can approve or
// decline with comments. Secretary then gets an email notifying them that there
// are issues with the minutes that need rectifying."
// ---------------------------------------------------------------------------

/** Somebody asked to check a draft. Frozen onto the record when it is sent, the
 *  same way approvalEngine freezes required approvers at submission: a person
 *  added to the distribution tag afterwards must not un-complete a round of
 *  review that had already finished. */
export interface MinutesReviewer {
  /** People-register id where there is one. A reviewer need not have a login. */
  personId?: string;
  name: string;
  email: string;
}

export interface MinutesReview {
  at: string;
  byName: string;
  byEmail?: string;
  decision: "approved" | "changes_requested";
  comments?: string;
  /**
   * 🔴 Which draft this was a response to.
   *
   * Without it, approving draft 1 would still count once the secretary has
   * rewritten it as draft 2, and minutes nobody has read would walk into
   * signing wearing last week's approvals. Reviews are never deleted, so the
   * history of what each round asked for survives; they are FILTERED by draft.
   */
  draftNumber: number;
}

/** A review only counts for the draft it was written against. */
export function reviewsForDraft(
  reviews: MinutesReview[],
  draftNumber: number
): MinutesReview[] {
  return reviews.filter((r) => r.draftNumber === draftNumber);
}

/** Email is the join key between a frozen reviewer and a review, so it has to
 *  be normalised on both sides. One pasted trailing space otherwise reads as a
 *  different person and the round never completes. */
function emailKey(v: string | undefined): string {
  return (v || "").trim().toLowerCase();
}

export function reviewProgress(
  reviewers: MinutesReviewer[],
  reviews: MinutesReview[],
  draftNumber: number
): {
  approved: number;
  total: number;
  /** Every named reviewer has approved THIS draft. */
  complete: boolean;
  waitingOn: string[];
  /** Anyone who asked for changes on this draft. One is enough to send it back:
   *  there is no point collecting the rest of the approvals for a document that
   *  is already being rewritten. */
  objections: MinutesReview[];
} {
  const forThis = reviewsForDraft(reviews, draftNumber);
  // Last word wins: a reviewer who asked for changes and then approved the same
  // draft after a chat is counted as approving.
  const latest = new Map<string, MinutesReview>();
  for (const r of forThis) {
    const k = emailKey(r.byEmail);
    if (!k) continue;
    const prev = latest.get(k);
    if (!prev || r.at >= prev.at) latest.set(k, r);
  }
  const approvedKeys = new Set(
    [...latest.values()].filter((r) => r.decision === "approved").map((r) => emailKey(r.byEmail))
  );
  const approved = reviewers.filter((p) => approvedKeys.has(emailKey(p.email))).length;
  return {
    approved,
    total: reviewers.length,
    complete: reviewers.length > 0 && approved === reviewers.length,
    waitingOn: reviewers.filter((p) => !approvedKeys.has(emailKey(p.email))).map((p) => p.name),
    objections: [...latest.values()].filter((r) => r.decision === "changes_requested"),
  };
}

/** Whether this person was actually asked. Anyone else opening the link can
 *  read the draft but has nothing to respond to, which is deliberate: an
 *  approval from somebody who was never asked is not a check. */
export function isReviewer(reviewers: MinutesReviewer[], email: string | undefined): boolean {
  const k = emailKey(email);
  return !!k && reviewers.some((p) => emailKey(p.email) === k);
}

/** Sending out for checking is allowed from draft, and again after changes were
 *  requested. Not from awaiting_signatures: pull it back first, so it is
 *  obvious that the signatures collected so far no longer apply. */
export function canSendForReview(status: MinutesStatus): boolean {
  return status === "draft" || status === "changes_requested";
}

export function canReview(status: MinutesStatus): boolean {
  return status === "in_review";
}

// ---------------------------------------------------------------------------
// Signing.
//
// Carl: "let's just have it anyway and then add an option to download the final
// draft to MS Word so those who prefer a wet ink signature can sign and then
// upload."
//
// Under the ECT Act an ordinary electronic signature is data attached to a
// document, applied with the intention of signing. Two things make that stand
// up rather than being a claim: the signer did something deliberate (typed a
// code sent to them, not merely clicked while logged in), and we recorded WHAT
// THEY SIGNED. The second one is canonicalMinutes below.
// ---------------------------------------------------------------------------

/** Characters a person can read off an email and type without ambiguity.
 *  No O/0, no I/1/L. Same reasoning as lib/platformCodes.ts. */
export const SIGNING_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Codes are compared after this, so a pasted space, a lowercase letter or the
 *  hyphen somebody adds out of habit does not read as the wrong code. */
export function normaliseSigningCode(input: string): string {
  return String(input || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/**
 * 🔴 EXACTLY what a signature covers, as one deterministic string.
 *
 * Hashing the .docx would be useless: a zip carries timestamps, so building the
 * same minutes twice gives two different hashes and every signature would look
 * broken. Hashing the stored JSON would be almost as bad, because a field added
 * next year, or a key written in a different order by a different code path,
 * would break every signature already collected.
 *
 * So this names the fields deliberately and in a fixed order. It covers what a
 * reader would call the minutes: the title, the period, and every section with
 * its wording, its numbering and who was responsible. It does NOT cover the
 * signatures themselves, or the record would change its own hash as each person
 * signed and nobody after the first could be verified.
 */
export function canonicalMinutes(m: {
  title: string;
  body: MeetingBody;
  period: MeetingPeriod;
  sections: MinutesSection[];
}): string {
  const numbers = sectionNumbers(m.sections);
  const sections = [...m.sections]
    .sort((a, b) => a.order - b.order)
    .map((s) =>
      [
        numbers.get(s.id) ?? "",
        s.title.trim(),
        (s.body || "").replace(/\r\n/g, "\n").trim(),
        (s.responsible || "").trim(),
      ].join("\u001f")
    );
  return [
    m.title.trim(),
    m.body,
    formatPeriod(m.period),
    ...sections,
  ].join("\u001e");
}

/** Whether the document has changed since somebody signed it. A signature whose
 *  hash no longer matches is not merely stale, it is evidence that a signed
 *  record was edited, so it is shown rather than quietly recalculated. */
export function signatureMatchesDocument(
  signatory: Signatory,
  currentHash: string
): boolean {
  return !!signatory.documentHash && signatory.documentHash === currentHash;
}

/** Signing is open, but nothing has been signed yet, so it can still be pulled
 *  back for changes. Once one person has signed, pulling it back means throwing
 *  their signature away, which the UI has to say out loud. */
export function canOpenSigning(status: MinutesStatus): boolean {
  return status === "draft" || status === "changes_requested" || status === "in_review";
}
