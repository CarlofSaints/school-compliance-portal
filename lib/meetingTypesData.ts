import crypto from "node:crypto";
import { readJson, updateJson } from "./controlData";
import { listMinutes } from "./minutesData";
import { listTemplates } from "./minutesTemplates";
import {
  withBuiltIns,
  isBuiltInMeetingType,
  labelTaken,
  MAX_MEETING_TYPE_LABEL,
  type MeetingType,
} from "./meetingTypes";

// The school's meeting types. See lib/meetingTypes.ts for the rules.
const PATH = "settings/meeting-types.json";

export class MeetingTypeError extends Error {}

export async function getMeetingTypes(): Promise<MeetingType[]> {
  return withBuiltIns(await readJson<unknown>(PATH, null));
}

function cleanLabel(raw: unknown): string {
  const label = String(raw ?? "").trim();
  if (!label) throw new MeetingTypeError("Give the meeting type a name.");
  if (label.length > MAX_MEETING_TYPE_LABEL) {
    throw new MeetingTypeError(`Keep the name under ${MAX_MEETING_TYPE_LABEL} characters.`);
  }
  return label;
}

// Each change is ONE read-modify-write through updateJson, so two admins
// adding a type in the same moment cannot lose one.
async function change(mutate: (types: MeetingType[]) => MeetingType[]): Promise<MeetingType[]> {
  let out: MeetingType[] = [];
  await updateJson<unknown>(PATH, null, (current) => {
    out = mutate(withBuiltIns(current));
    return out;
  });
  return out;
}

export async function addMeetingType(rawLabel: unknown): Promise<MeetingType[]> {
  const label = cleanLabel(rawLabel);
  const created: MeetingType = { id: `mt-${crypto.randomUUID().slice(0, 8)}`, label };
  return change((types) => {
    if (labelTaken(types, label)) throw new MeetingTypeError(`There is already a meeting type called "${label}".`);
    return [...types, created];
  });
}

export async function renameMeetingType(id: string, rawLabel: unknown): Promise<MeetingType[]> {
  const label = cleanLabel(rawLabel);
  return change((types) => {
    if (!types.some((t) => t.id === id)) throw new MeetingTypeError("That meeting type no longer exists.");
    if (labelTaken(types, label, id)) throw new MeetingTypeError(`There is already a meeting type called "${label}".`);
    return types.map((t) => (t.id === id ? { ...t, label } : t));
  });
}

/** The minutes and templates using a type, so a removal can say what blocks it. */
export async function meetingTypeUsage(): Promise<Record<string, { minutes: string[]; templates: string[] }>> {
  const [minutes, templates] = await Promise.all([listMinutes(), listTemplates()]);
  const usage: Record<string, { minutes: string[]; templates: string[] }> = {};
  const at = (id: string) => (usage[id] ??= { minutes: [], templates: [] });
  for (const m of minutes) at(m.body).minutes.push(m.title);
  for (const t of templates) if (t.body) at(t.body).templates.push(t.name);
  return usage;
}

export async function removeMeetingType(id: string): Promise<MeetingType[]> {
  if (isBuiltInMeetingType(id)) {
    throw new MeetingTypeError("The three built-in meeting types can be renamed but not removed.");
  }
  const used = (await meetingTypeUsage())[id];
  if (used && (used.minutes.length || used.templates.length)) {
    const parts = [
      used.minutes.length ? `minutes (${used.minutes.slice(0, 3).join(", ")}${used.minutes.length > 3 ? "..." : ""})` : "",
      used.templates.length ? `templates (${used.templates.slice(0, 3).join(", ")})` : "",
    ].filter(Boolean);
    throw new MeetingTypeError(`It is still used by ${parts.join(" and ")}. Move those to another type first.`);
  }
  return change((types) => types.filter((t) => t.id !== id));
}

/** For the routes that take a type from a request: only a type the school has. */
export async function isMeetingTypeId(id: unknown): Promise<boolean> {
  return typeof id === "string" && (await getMeetingTypes()).some((t) => t.id === id);
}

