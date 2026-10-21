// ---------------------------------------------------------------------------
// Per-school branding (multi-tenant).
//
// One codebase serves every school. Which school a given deployment renders is
// chosen by the NEXT_PUBLIC_SCHOOL env var, set per Vercel project. Each school
// also gets its OWN Vercel Blob store (separate BLOB_READ_WRITE_TOKEN), so data
// and users never cross between schools.
//
// There is NO "main"/base school — every tenant is a peer (HVPS included). If
// NEXT_PUBLIC_SCHOOL is unset or unknown, we fall back to NEUTRAL "generic"
// branding on purpose, so a misconfigured deployment is obvious rather than
// silently masquerading as a real school.
//
// IMPORTANT: every production Vercel project MUST set NEXT_PUBLIC_SCHOOL
// (e.g. the existing HVPS project now needs NEXT_PUBLIC_SCHOOL=hvps).
//
// To onboard a new school: add an entry below, drop its logo in /public, set
// NEXT_PUBLIC_SCHOOL + a new Blob store on its Vercel project. No other code.
// ---------------------------------------------------------------------------

export interface SchoolBranding {
  key: string;
  /** Governance model. "public" = government school with an SGB (School
   *  Governing Body); "private" = independent school with a Board of Governors /
   *  Directors / Trustees. Drives the position list + governance terminology
   *  shown across the portal (see lib/positions.ts). Pick this FIRST when
   *  onboarding a school. */
  schoolType: "public" | "private";
  /** Short acronym — sidebar heading, "Not an issue for X" labels. */
  shortName: string;
  /** Full legal name — login, dashboard, email + PDF headers. */
  fullName: string;
  /** Small text under the sidebar heading. */
  portalSubtitle: string;
  /** Longer descriptor — login, email + PDF subtitle, page <title>. */
  tagline: string;
  /** Motto shown in the login + email footer. */
  slogan: string;
  /** Optional suffix after the slogan in the login footer (e.g. "STRIVE"). */
  sloganSuffix?: string;
  /** Logo path under /public. */
  logo: string;
  logoAlt: string;
  /** Resend "From" address — the domain must be verified in Resend. Which is
   *  exactly why a school does NOT get to choose it; see lib/emailIdentity.ts. */
  fromEmail: string;
  /** Where replies go. Set by the school, needs no DNS. Absent means the
   *  Reply-To header is left off entirely. */
  replyTo?: string;
  /** Set by the school under Branding; printed in the Word minutes footer. */
  wordFooter?: string;
  colors: {
    /** Brand primary — buttons, headings, email header. White text sits on
     *  this, so it must be dark enough for white to read (cyan, black, navy…). */
    primary: string;
    /** Darker primary for hover states (hex). */
    primaryDark: string;
    /** Near-black text colour (hex). */
    dark: string;
    /** Light tint of primary, used for email subtitle text (hex). */
    primaryTint: string;
    /** Accent — sidebar brand name + active-nav highlight (shows on the dark
     *  sidebar). Lets a bright brand colour (e.g. Jeppe yellow) feature without
     *  failing white-text contrast on buttons. Set = primary if no separate
     *  accent is wanted. */
    accent: string;
  };
}

const SCHOOLS: Record<string, SchoolBranding> = {
  // Neutral fallback — used only when NEXT_PUBLIC_SCHOOL is unset/unknown
  // (local dev or a misconfigured deploy). Not a real tenant.
  generic: {
    key: "generic",
    schoolType: "public",
    // 🔴 shortName and portalSubtitle are CONCATENATED as
    // `${shortName} ${portalSubtitle}` for the browser title and three email
    // subjects, and this used to be "Portal" + "Compliance Portal" = "Portal
    // Compliance Portal". brandingData.ts already fixes that for a school that
    // has stored a name; what was left was a host with NO stored branding at
    // all, which is exactly /start, the page every prospective school is now
    // sent to.
    //
    // ⚠️ Fixed on shortName, NOT on portalSubtitle. Every self-serve school
    // inherits portalSubtitle from here and only overrides shortName, so
    // shortening it to "Portal" renamed Demo Primary School's tab from
    // "... Compliance Portal" to "... Portal". Change this pair only after
    // checking BOTH an unknown host and a provisioned school.
    shortName: "School",
    fullName: "School Compliance Portal",
    portalSubtitle: "Compliance Portal",
    tagline: "Compliance Portal",
    slogan: "",
    // 🔴 EMPTY, not "/logo.png". That file is Hurlyvale's actual crest, and
    // this fallback is what every school on the shared deployment gets until
    // it uploads its own - so St Bothians came up wearing another school's
    // badge, on its sign-in page AND in the header of every email it sent.
    // Empty means "no crest yet"; the neutral product mark is drawn instead.
    logo: "",
    logoAlt: "Compliance Portal",
    fromEmail: "Compliance Portal <noreply@schoolcompliance.co.za>",
    colors: {
      primary: "#475569", // neutral slate — clearly not a school's CI
      primaryDark: "#334155",
      dark: "#1A1A1A",
      primaryTint: "#cbd5e1",
      accent: "#475569",
    },
  },

  hvps: {
    key: "hvps",
    schoolType: "public",
    shortName: "HVPS",
    fullName: "Hurlyvale Primary School",
    portalSubtitle: "Compliance Portal",
    tagline: "SGB Compliance Portal",
    slogan: "We are family!",
    sloganSuffix: "STRIVE",
    logo: "/logo.png",
    logoAlt: "Hurlyvale Primary School Crest",
    fromEmail: "HVPS Compliance <noreply@schoolcompliance.co.za>",
    colors: {
      primary: "#00BCD4",
      primaryDark: "#00838F",
      dark: "#1A1A1A",
      primaryTint: "#e0f7fa",
      accent: "#00BCD4", // same as primary → HVPS sidebar unchanged
    },
  },

  // ---- Jeppe Girls High. Brand: black + yellow (#fcb517), motto on the crest.
  // Mapped as a black-primary brand (white text reads on black across all
  // buttons/headings/email) with the school yellow as the sidebar ACCENT.
  jeppe: {
    key: "jeppe",
    schoolType: "public",
    shortName: "JGHS", // 【CONFIRM】 preferred acronym
    fullName: "Jeppe Girls High", // 【CONFIRM】 exact legal name
    portalSubtitle: "Compliance Portal",
    tagline: "SGB Compliance Portal",
    slogan: "Forti Nihil Difficilius", // motto from the crest
    logo: "/logo-jeppe.png",
    logoAlt: "Jeppe Girls High Crest",
    fromEmail: "Jeppe Girls Compliance <noreply@schoolcompliance.co.za>",
    colors: {
      primary: "#000000", // black — white text reads on it everywhere
      primaryDark: "#333333", // hover state
      dark: "#000000", // black sidebar
      primaryTint: "#e5e7eb", // light grey for email subtitle on black header
      accent: "#fcb517", // Jeppe yellow — sidebar brand + active nav
    },
  },
};

const KEY = (process.env.NEXT_PUBLIC_SCHOOL || "generic").toLowerCase();

export const branding: SchoolBranding = SCHOOLS[KEY] ?? SCHOOLS.generic;

/** Longest Word minutes footer, in characters, and most lines it may have. */
export const MAX_WORD_FOOTER = 500;
export const MAX_WORD_FOOTER_LINES = 6;

/**
 * Text as docx may write it into a Word file. 🔴 docx escapes & < > " but
 * writes control characters, lone surrogates and U+FFFE/U+FFFF into the XML
 * as they are, and Word then refuses to open the file. Tab, LF and CR are
 * legal XML and kept.
 */
export function docxText(raw: string): string {
  return raw
    // Keep pairs, drop lone halves. No lookbehind: this file loads on every
    // page and Safari before 16.4 throws a SyntaxError on one.
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, (m) => (m.length === 2 ? m : ""))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFE\uFFFF]/g, "");
}

/**
 * The Word minutes footer as it may be stored and printed: docxText, a tab
 * becomes a space, blank-line runs collapse to one, blank lines at either end
 * go, then the length cap (by code point, so an emoji is never cut in half).
 * Lines are NOT cut here: more than MAX_WORD_FOOTER_LINES is refused on save
 * (wordFooterLineCount), so nobody loses a line without being told.
 */
export function cleanWordFooter(raw: string): string {
  const lines = docxText(raw.replace(/\t/g, " "))
    .split(/\r\n|\r|\n/)
    .map((l) => l.trimEnd())
    .filter((l, i, all) => l.trim() !== "" || (i > 0 && all[i - 1].trim() !== ""));
  return Array.from(lines.join("\n").trim()).slice(0, MAX_WORD_FOOTER).join("").trim();
}

/** Lines the footer will print as, after cleaning (0 when empty). */
export function wordFooterLineCount(raw: string): number {
  const clean = cleanWordFooter(raw);
  return clean ? clean.split("\n").length : 0;
}

/** Convert a "#RRGGBB" hex string to an [r, g, b] tuple for jsPDF. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
