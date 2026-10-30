import { readFile } from "fs/promises";
import path from "path";
import { readSignatureImage } from "./minutesData";
import type { MinutesRecord } from "./minutesData";
import { buildMinutesDocx } from "./minutesDocx";
import { resolveBranding, readLogo } from "./brandingData";
import type { SchoolBranding } from "./branding";
import { formatPeriod } from "./minutes";

// ---------------------------------------------------------------------------
// The minutes as a finished Word file: record plus crest and signature
// marks, gathered and built. One standard template for every school (Carl,
// 19 Oct 2026: per-school letterheads would each need catering for).
//
// 🔴 ONE place, used by the download AND by the signed-minutes email. Carl
// asked for the Word file to be attached when signed minutes go out, and the
// copy in a governor's inbox must be the same document the Download button
// gives - the same signatures - not a second build that
// quietly drifts from it.
// ---------------------------------------------------------------------------

export async function buildMinutesDocxFile(record: MinutesRecord): Promise<Buffer> {
  const branding = await resolveBranding();
  // The school's uploaded crest if it has one; null is fine and the document
  // simply has no picture. A missing crest must not fail a download somebody
  // needs for a meeting tonight.
  // Falls back to the built-in crest (HVPS and Jeppe ship theirs in /public,
  // never uploaded one), which next.config.ts traces into every API function.
  const crest = await schoolCrest(branding);

  // No People lookup for the sections: the responsible name was frozen into
  // each one when the template was copied, so the document shows who was
  // responsible AT THAT MEETING rather than whoever holds the post today.
  //
  // Each signatory's mark. Read in parallel and tolerant of gaps: a document
  // must not fail because one signature image is unreadable, and a signature
  // that cannot be drawn still has its wording in the document.
  const marks = await Promise.all(
    record.signatories
      .filter((s) => s.signedAt)
      .map(async (s) => {
        const png = await readSignatureImage(record.id, s.email, record.signatories.map((x) => x.email)).catch(() => null);
        if (!png || !s.signature) return null;
        return [
          s.email.trim().toLowerCase(),
          { png, width: s.signature.width, height: s.signature.height },
        ] as const;
      })
  );
  const signatures = new Map(
    marks.filter((m): m is NonNullable<typeof m> => m !== null)
  );

  return buildMinutesDocx(record, branding, crest, signatures);
}

/** The school's crest bytes for a Word file, or null. Also the policy letterhead (lib/policyCompile.ts). */
export async function schoolCrest(branding: SchoolBranding): Promise<Buffer | null> {
  return (
    (await readLogo().catch(() => null)) ??
    (branding.logo.startsWith("/") && branding.logo.endsWith(".png")
      ? await readFile(path.join(process.cwd(), "public", branding.logo)).catch(() => null)
      : null)
  );
}

/** "SGB meeting 7 May September-2026.docx", the name both copies share. */
export function minutesDocxFilename(record: MinutesRecord): string {
  const safePeriod = formatPeriod(record.period).replace(/[^A-Za-z0-9]+/g, "-");
  return `${record.title} ${safePeriod}.docx`.replace(/\s+/g, " ").trim();
}
