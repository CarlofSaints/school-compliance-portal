import { readJson, writeJson } from "./controlData";
import { POSITIONS } from "./positions";

export { POSITIONS };

export interface Person {
  id: string;
  position: string;
  userId: string | null;
  name: string;
  email: string;
  phone: string;
  profilePic: string;
  // See lib/tagData.ts - a tag can sit on a Person or on a User.
  tagIds?: string[];
}

const PEOPLE_PATH = "people.json";

// A person's photo only ever lives at people/<their id>/photo-<time>.<ext>.
// profilePic is a storage PATH that this app reads, serves and deletes, so a
// value from anywhere else is refused: it used to be taken from the request
// body, which let it point at users.json (then served to any signed-in user)
// or at the action register (then deleted along with the person).
export function isOwnPhotoPath(personId: string, path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.startsWith(`people/${personId}/photo-`) &&
    /^people\/[0-9a-zA-Z-]+\/photo-\d+\.(jpg|jpeg|png|webp)$/.test(path)
  );
}

/** The fields the People screens edit, and nothing else. */
export function personFieldsFrom(body: Record<string, unknown>): Partial<Omit<Person, "id" | "profilePic">> {
  const out: Partial<Omit<Person, "id" | "profilePic">> = {};
  if (typeof body.position === "string") out.position = body.position;
  if (body.userId === null || typeof body.userId === "string") out.userId = (body.userId as string | null) || null;
  if (typeof body.name === "string") out.name = body.name;
  if (typeof body.email === "string") out.email = body.email;
  if (typeof body.phone === "string") out.phone = body.phone;
  if (Array.isArray(body.tagIds)) out.tagIds = body.tagIds.filter((t): t is string => typeof t === "string");
  return out;
}


// The URL a browser should use for a person's photo, or null when they have
// none. The stored blob path ends in photo-<timestamp>.<ext>, and that file
// name is passed through as ?v=, so the URL changes whenever the photo is
// replaced and the image can be cached hard without ever going stale.
export function photoUrlFor(person: Person): string | null {
  if (!person.profilePic) return null;
  const version = person.profilePic.split("/").pop() || "";
  return `/api/people/${person.id}/photo?v=${encodeURIComponent(version)}`;
}

export async function getPeople(): Promise<Person[]> {
  return readJson<Person[]>(PEOPLE_PATH, []);
}

export async function savePeople(people: Person[]): Promise<void> {
  return writeJson(PEOPLE_PATH, people);
}

export async function getPersonById(id: string): Promise<Person | undefined> {
  const people = await getPeople();
  return people.find((p) => p.id === id);
}

export async function createPerson(person: Person): Promise<void> {
  const people = await getPeople();
  people.push(person);
  await savePeople(people);
}

export async function updatePerson(
  id: string,
  updates: Partial<Omit<Person, "id">>
): Promise<Person | null> {
  const people = await getPeople();
  const idx = people.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  people[idx] = { ...people[idx], ...updates };
  await savePeople(people);
  return people[idx];
}

export async function deletePerson(id: string): Promise<boolean> {
  const people = await getPeople();
  const filtered = people.filter((p) => p.id !== id);
  if (filtered.length === people.length) return false;
  await savePeople(filtered);
  return true;
}

export async function getPeopleByPositions(
  positions: string[]
): Promise<Person[]> {
  const people = await getPeople();
  return people.filter((p) => positions.includes(p.position) && p.email);
}
