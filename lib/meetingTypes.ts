import { tk } from "./i18n/translate";

// ---------------------------------------------------------------------------
// MEETING TYPES: SGB / Board, FINCOM, Other, plus any the school adds (AGM...).
//
// Carl: "in Minutes Admin, we should have a place to create and edit meeting
// types". PURE, so client screens can import it.
//
// 🔴 A set of minutes stores the type's ID, never its name. The id is part of
// what a signature is bound to (canonicalMinutes), so renaming "SGB / Board"
// to "SGB" changes what the screens say and leaves every signature valid.
//
// The three built-ins can be renamed but never removed: FINCOM has its own
// distribution list and reader default, and old minutes point at all three.
// Every other type sends its signed minutes to the SGB list (Carl: "for now,
// these minutes will just go to the SGB").
// ---------------------------------------------------------------------------

export interface MeetingType {
  id: string;
  label: string;
}

export const BUILT_IN_MEETING_TYPES: MeetingType[] = [
  { id: "sgb", label: tk("SGB / Board") },
  { id: "fincom", label: tk("FINCOM") },
  { id: "other", label: tk("Other") },
];

export const isBuiltInMeetingType = (id: string) => BUILT_IN_MEETING_TYPES.some((t) => t.id === id);

export const MAX_MEETING_TYPE_LABEL = 60;

/** Built-ins always present (with the school's own name if it renamed one),
 *  then the school's own types in the order added. Junk entries dropped. */
export function withBuiltIns(saved: unknown): MeetingType[] {
  const list = Array.isArray(saved) ? saved : [];
  const clean = list
    .filter((t): t is MeetingType => !!t && typeof t.id === "string" && typeof t.label === "string" && !!t.label.trim())
    .map((t) => ({ id: t.id, label: t.label.trim().slice(0, MAX_MEETING_TYPE_LABEL) }));
  const own = (id: string) => clean.find((t) => t.id === id);
  return [
    ...BUILT_IN_MEETING_TYPES.map((b) => own(b.id) ?? b),
    ...clean.filter((t, i) => !isBuiltInMeetingType(t.id) && clean.findIndex((x) => x.id === t.id) === i),
  ];
}

/** The name to show. Passed through t() by the caller: a built-in's default
 *  English name is in the dictionaries, a school's own name is shown as typed. */
export function meetingTypeLabel(types: MeetingType[], id: string): string {
  return types.find((t) => t.id === id)?.label ?? BUILT_IN_MEETING_TYPES.find((t) => t.id === id)?.label ?? id;
}

/** A name nobody else has, compared without case or spaces at the ends. */
export function labelTaken(types: MeetingType[], label: string, exceptId?: string): boolean {
  const k = label.trim().toLowerCase();
  return types.some((t) => t.id !== exceptId && t.label.trim().toLowerCase() === k);
}
