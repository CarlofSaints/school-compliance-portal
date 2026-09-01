import { readJson, writeJson } from "./controlData";
import { POSITIONS } from "./positions";
import { getPeople, savePeople } from "./peopleData";
import { getSpendApplications } from "./spendData";

const PATH = "settings/positions.json";

// Trims, drops blanks, and removes duplicates case-insensitively while keeping
// the first spelling and the given order. Order matters: it is the order the
// People directory reads in, roughly by seniority.
export function normalisePositions(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const name = String(raw ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

// The school's governance positions.
//
// Seeded from the built-in list the first time they are read, and after that
// the saved list is what counts, so a position removed in Admin stays removed
// rather than reappearing on the next read. Same rule as policy categories.
//
// The built-in list is chosen by school type (SGB for a public school, Board
// for an independent one), so a school starts with the right vocabulary and
// then edits it to match how it is actually structured.
export async function getPositions(): Promise<string[]> {
  const saved = await readJson<string[] | null>(PATH, null);
  if (!Array.isArray(saved) || saved.length === 0) {
    return [...POSITIONS];
  }
  const clean = normalisePositions(saved);
  return clean.length > 0 ? clean : [...POSITIONS];
}

export async function savePositions(positions: string[]): Promise<string[]> {
  const clean = normalisePositions(positions);
  await writeJson(PATH, clean);
  return clean;
}

export interface PositionUsage {
  // People on the register currently holding it.
  people: string[];
  // Fund applications where this position is written into approval history.
  approvals: { id: string; projectName: string; where: string }[];
}

// Where a position name actually appears in the data.
//
// This is what makes renaming or removing one safe to refuse. A position is not
// only a label on the register: when a band names a PERSON rather than a tag,
// approvalResolver freezes that person's position onto the application as the
// approver group's name, and every recorded decision stores the position the
// approver held at the time. Both are historical records of who authorised
// school spending. Rename the position and they start referring to something
// that no longer exists; remove it and the record is left describing a role the
// school no longer has.
export async function getPositionUsage(): Promise<Record<string, PositionUsage>> {
  const [people, applications] = await Promise.all([
    getPeople(),
    getSpendApplications(),
  ]);

  const usage: Record<string, PositionUsage> = {};
  const bucket = (name: string): PositionUsage => {
    const key = name.trim();
    if (!usage[key]) usage[key] = { people: [], approvals: [] };
    return usage[key];
  };

  for (const person of people) {
    if (!person.position) continue;
    bucket(person.position).people.push(person.name || "Unnamed");
  }

  for (const app of applications) {
    const label = app.projectName || "Untitled application";

    for (const approver of app.requiredApprovers || []) {
      if (!approver.tagName) continue;
      bucket(approver.tagName).approvals.push({
        id: app.id,
        projectName: label,
        where: "named as an approver",
      });
    }

    for (const decision of app.approvals || []) {
      if (!decision.position) continue;
      bucket(decision.position).approvals.push({
        id: app.id,
        projectName: label,
        where: "recorded on a decision",
      });
    }
  }

  return usage;
}

export function usageFor(
  usage: Record<string, PositionUsage>,
  name: string
): PositionUsage {
  // Matched case-insensitively: a position stored as "SGB Treasurer" and typed
  // as "sgb treasurer" is the same role, and a rename that missed one would be
  // exactly the silent breakage this is here to prevent.
  const key = name.trim().toLowerCase();
  for (const [stored, value] of Object.entries(usage)) {
    if (stored.trim().toLowerCase() === key) return value;
  }
  return { people: [], approvals: [] };
}

// Renames a position and moves everyone holding it across in the same pass.
// The caller is responsible for having refused the rename if it appears in an
// approval; this only carries the register with it.
export async function renamePositionOnPeople(
  from: string,
  to: string
): Promise<number> {
  const people = await getPeople();
  const key = from.trim().toLowerCase();
  let moved = 0;
  for (const person of people) {
    if ((person.position || "").trim().toLowerCase() === key) {
      person.position = to;
      moved++;
    }
  }
  if (moved > 0) await savePeople(people);
  return moved;
}
