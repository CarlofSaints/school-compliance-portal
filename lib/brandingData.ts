import { readJson, writeJson, readFile, writeFile, deleteFile } from "./controlData";
import { branding as codeBranding, type SchoolBranding } from "./branding";
import { derivePalette, normaliseHex } from "./brandingColors";

// ---------------------------------------------------------------------------
// Branding a school can change ITSELF, stored in that school's own blob store.
//
// lib/branding.ts stays as the built-in defaults for the schools that predate
// this. Anything saved here wins over it. Because it goes through controlData,
// it is automatically scoped to whichever school the request is for — the same
// store, the same prefix, no separate plumbing.
//
// Only the things a school actually knows about are stored: its crest and its
// two colours. Every other shade is derived (lib/brandingColors.ts).
// ---------------------------------------------------------------------------

const BRANDING_PATH = "branding.json";
const LOGO_PATH = "branding/logo";

export interface StoredBranding {
  /** Full legal name. Optional — falls back to the built-in default. */
  fullName?: string;
  /** Short acronym. */
  shortName?: string;
  primary?: string;
  accent?: string;
  /** Set once a crest has been uploaded. The bytes live at LOGO_PATH; this
   *  records the type and a version so a changed crest busts caches. */
  logo?: {
    contentType: string;
    filename: string;
    /** Bumped on every upload. Appended to the logo URL as ?v=, because the
     *  path never changes and browsers and mail clients cache hard. */
    version: number;
    updatedAt: string;
  };
}

export async function getStoredBranding(): Promise<StoredBranding> {
  return readJson<StoredBranding>(BRANDING_PATH, {});
}

export async function saveStoredBranding(
  next: StoredBranding
): Promise<StoredBranding> {
  await writeJson(BRANDING_PATH, next);
  // Returned so the caller can hand back what was SAVED rather than re-reading
  // it — a read straight after a write can still serve the old copy.
  return next;
}

export async function saveLogo(
  bytes: Buffer,
  contentType: string,
  filename: string
): Promise<StoredBranding> {
  const current = await getStoredBranding();
  await writeFile(LOGO_PATH, bytes);
  return saveStoredBranding({
    ...current,
    logo: {
      contentType,
      filename,
      version: (current.logo?.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    },
  });
}

export async function removeLogo(): Promise<StoredBranding> {
  const current = await getStoredBranding();
  await deleteFile(LOGO_PATH);
  const next = { ...current };
  delete next.logo;
  return saveStoredBranding(next);
}

export async function readLogo(): Promise<Buffer | null> {
  return readFile(LOGO_PATH);
}

/**
 * The branding to actually render: built-in defaults, with anything the school
 * has saved laid over the top.
 *
 * `logoPath` is a URL rather than a file under /public once a crest has been
 * uploaded, because an uploaded crest lives in the school's store. Emails need
 * it to resolve without a login, which is why /api/branding/logo is public.
 */
export async function resolveBranding(): Promise<SchoolBranding> {
  const stored = await getStoredBranding();
  return applyStoredBranding(codeBranding, stored);
}

/** Pure merge, so it can be checked without a store. */
export function applyStoredBranding(
  base: SchoolBranding,
  stored: StoredBranding
): SchoolBranding {
  const primary = normaliseHex(stored.primary ?? "") ?? base.colors.primary;
  const accent = normaliseHex(stored.accent ?? "") ?? base.colors.accent;

  // Only re-derive when the school has actually chosen something. Otherwise the
  // built-in palettes stay EXACTLY as they are — HVPS and Jeppe were tuned by
  // hand and re-deriving would quietly shift them.
  const chose = stored.primary != null || stored.accent != null;
  const palette = chose ? derivePalette(primary, accent) : null;

  return {
    ...base,
    fullName: stored.fullName?.trim() || base.fullName,
    shortName: stored.shortName?.trim() || base.shortName,
    logo: stored.logo
      ? `/api/branding/logo?v=${stored.logo.version}`
      : base.logo,
    colors: palette
      ? {
          primary: palette.primary,
          primaryDark: palette.primaryDark,
          primaryTint: palette.primaryTint,
          dark: palette.dark,
          accent: palette.accent,
        }
      : base.colors,
  };
}
