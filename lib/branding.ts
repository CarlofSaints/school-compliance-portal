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
    // 🔴 These two get concatenated as `${shortName} ${portalSubtitle}` for the
    // browser title and three email subjects, so "Portal" + "Compliance Portal"
    // read as "Portal Compliance Portal". Harmless on a real school, which has
    // its own entry, but the generic fallback IS what an unknown host sees, and
    // /start on an unknown host is the page every prospective school is about
    // to be sent to. Split so the concatenation reads properly.
    shortName: "School Compliance",
    fullName: "School Compliance Portal",
    portalSubtitle: "Portal",
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

/** Convert a "#RRGGBB" hex string to an [r, g, b] tuple for jsPDF. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
