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
   * People associated with this section, from the People register rather than
   * the user list, so a Treasurer with no login can still own Finance report.
   * Advisory: it tells the secretary who to chase, it does not gate anything.
   */
  personIds?: string[];
  order: number;
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
 * People links are NOT copied. They belong to the template as a standing note
 * about who owns a section; a set of minutes records what was said, not who was
 * meant to say it.
 */
export function sectionsFromTemplate(template: MinutesTemplate): MinutesSection[] {
  return [...template.sections]
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({
      id: crypto.randomUUID(),
      title: s.title,
      body: s.staticContent || "",
      order: i + 1,
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
