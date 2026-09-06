import crypto from "crypto";
import { readJson, writeJson, deleteFile, listFiles } from "./controlData";
import type { MeetingBody } from "./minutes";
import type { MinutesTemplate, TemplateSection } from "./minutes";

// The types, the starter set and sectionsFromTemplate live in lib/minutes.ts
// because they are pure and a client component needs them. Re-exported so
// every server-side `from "@/lib/minutesTemplates"` keeps working.
export * from "./minutes";

// ---------------------------------------------------------------------------
// Minutes templates: the reusable SHAPE of a meeting.
//
// Carl: "in the admin centre, they click create minutes template - name the
// template, add sections, link people to sections (optional), static content
// can be added to sections (optional) - example, at the top of all minutes is
// the attendees (this barely changes from meeting to meeting, so this content
// can be in the template itself and then editible for a specific version)."
//
// ⚠️ NOT the Word letterhead (lib/minutesData.ts, LetterheadTemplate). That is a
// .docx carrying the crest and footer. This is the section structure.
//
// 🔴 A template is COPIED into a set of minutes, never referenced by it.
//
// Minutes are a record of what a meeting agreed. If they rendered live from a
// template, editing the template next year would silently rewrite what a
// meeting in 2026 appears to have discussed, and a signed record would change
// under its signatures. So creating minutes takes a snapshot and the two have
// nothing to do with each other afterwards.
// ---------------------------------------------------------------------------

const DIR = "minutes-templates";
const templatePath = (id: string) => `${DIR}/${id}/template.json`;

export async function getTemplate(id: string): Promise<MinutesTemplate | null> {
  return readJson<MinutesTemplate | null>(templatePath(id), null);
}

/** Enumerated from storage, not an index, so a template cannot exist and be
 *  invisible. Same reasoning as the minutes themselves. */
export async function listTemplates(): Promise<MinutesTemplate[]> {
  const ids = await listFiles(DIR);
  const all = await Promise.all(ids.map((id) => getTemplate(id)));
  return all
    .filter((t): t is MinutesTemplate => t !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Renumbers from array position, so order is always 1..n with no gaps however
 *  the caller sent it. */
function normaliseSections(
  sections: Omit<TemplateSection, "order">[] | TemplateSection[]
): TemplateSection[] {
  return sections.map((s, i) => ({
    id: s.id || crypto.randomUUID(),
    title: String(s.title || "").trim(),
    staticContent: s.staticContent?.trim() || undefined,
    positions: s.positions?.length ? s.positions : undefined,
    // Named explicitly. This function rebuilds a section field by field, so a
    // property it does not mention is silently discarded on every save.
    numberingStartsHere: s.numberingStartsHere || undefined,
    order: i + 1,
  }));
}

export async function createTemplate(input: {
  name: string;
  body?: MeetingBody;
  description?: string;
  sections: Omit<TemplateSection, "order">[];
  createdBy: string;
}): Promise<MinutesTemplate> {
  const now = new Date().toISOString();
  const template: MinutesTemplate = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    body: input.body,
    description: input.description?.trim() || undefined,
    sections: normaliseSections(input.sections),
    createdAt: now,
    createdBy: input.createdBy,
    updatedAt: now,
  };
  await writeJson(templatePath(template.id), template);
  return template;
}

export async function updateTemplate(
  id: string,
  updates: Partial<Pick<MinutesTemplate, "name" | "body" | "description">> & {
    sections?: Omit<TemplateSection, "order">[];
  }
): Promise<MinutesTemplate | null> {
  const existing = await getTemplate(id);
  if (!existing) return null;

  const next: MinutesTemplate = {
    ...existing,
    ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
    ...(updates.body !== undefined ? { body: updates.body } : {}),
    ...(updates.description !== undefined
      ? { description: updates.description.trim() || undefined }
      : {}),
    ...(updates.sections !== undefined
      ? { sections: normaliseSections(updates.sections) }
      : {}),
    updatedAt: new Date().toISOString(),
  };
  await writeJson(templatePath(id), next);
  return next;
}

/**
 * Deletes a template.
 *
 * Safe at any time, and deliberately so: minutes COPY their sections, so no
 * existing record depends on this and nothing written in the past changes.
 */
export async function deleteTemplate(id: string): Promise<boolean> {
  const existing = await getTemplate(id);
  if (!existing) return false;
  await deleteFile(templatePath(id));
  return true;
}
