import { readSignatureImage } from "./minutesData";
import type { MinutesRecord } from "./minutesData";
import { readLetterheadFile } from "./letterheadData";
import { getPeople } from "./peopleData";
import { buildMinutesDocx } from "./minutesDocx";
import { resolveBranding, readLogo } from "./brandingData";
import { formatPeriod } from "./minutes";

// ---------------------------------------------------------------------------
// The minutes as a finished Word file: record plus crest, signature marks,
// letterhead and governing body, gathered and built.
//
// 🔴 ONE place, used by the download AND by the signed-minutes email. Carl
// asked for the Word file to be attached when signed minutes go out, and the
// copy in a governor's inbox must be the same document the Download button
// gives - the same letterhead, the same signatures - not a second build that
// quietly drifts from it.
// ---------------------------------------------------------------------------

export async function buildMinutesDocxFile(record: MinutesRecord): Promise<Buffer> {
  const branding = await resolveBranding();
  // The school's uploaded crest if it has one; null is fine and the document
  // simply has no picture. A missing crest must not fail a download somebody
  // needs for a meeting tonight.
  const crest = await readLogo().catch(() => null);

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
        const png = await readSignatureImage(record.id, s.email).catch(() => null);
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

  // The school's own letterhead, if it uploaded one. Tolerant of failure: a
  // letterhead that cannot be read must fall back to the generated layout, not
  // refuse to produce the minutes at all.
  const letterhead = await readLetterheadFile().catch(() => null);

  // Who holds each governing body position now, for a letterhead using
  // {{governors}}. patchDocument ignores a patch whose placeholder is not in
  // the file, so this costs nothing for a letterhead without it.
  //
  // 🔴 Grouped, not a lookup of one name per position. Two people genuinely do
  // share a seat (co-opted members, a joint deputy), and keeping only the
  // first would drop somebody off the school's own letterhead.
  const governorsByPosition = new Map<string, string[]>();
  for (const person of await getPeople()) {
    const position = (person.position || "").trim();
    const name = (person.name || "").trim();
    if (!position || !name) continue;
    governorsByPosition.set(position, [
      ...(governorsByPosition.get(position) ?? []),
      name,
    ]);
  }

  return buildMinutesDocx(
    record,
    branding,
    crest,
    signatures,
    letterhead,
    governorsByPosition
  );
}

/** "SGB meeting 7 May September-2026.docx", the name both copies share. */
export function minutesDocxFilename(record: MinutesRecord): string {
  const safePeriod = formatPeriod(record.period).replace(/[^A-Za-z0-9]+/g, "-");
  return `${record.title} ${safePeriod}.docx`.replace(/\s+/g, " ").trim();
}
