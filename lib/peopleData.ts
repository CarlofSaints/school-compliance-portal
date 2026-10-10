import { readJson, writeJson, updateJson, NO_CHANGE } from "./controlData";
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

/** Replaces the whole register. Only for seeding demo data. */
export async function savePeople(people: Person[]): Promise<void> {
  return writeJson(PEOPLE_PATH, people);
}

// 🔴 Every change below goes through updateJson (lib/controlData.ts): it only
// writes if nobody else saved the register since it was read, otherwise it
// re-applies the change to the fresh copy. Before, saving the People form and
// uploading that person's photo at the same moment kept only one of them, and
// two admins editing different people could lose an edit.

/** Changes the register in one guarded write. `change` may run more than
 *  once; return NO_CHANGE to write nothing. */
export async function changePeople(
  change: (people: Person[]) => Person[] | typeof NO_CHANGE
): Promise<Person[]> {
  return updateJson<Person[]>(PEOPLE_PATH, [], change);
}

export async function getPersonById(id: string): Promise<Person | undefined> {
  const people = await getPeople();
  return people.find((p) => p.id === id);
}

export async function createPerson(person: Person): Promise<void> {
  await changePeople((people) => [...people, person]);
}

export async function updatePerson(
  id: string,
  updates: Partial<Omit<Person, "id">> | ((current: Person) => Partial<Omit<Person, "id">>)
): Promise<Person | null> {
  let saved: Person | null = null;
  await changePeople((people) => {
    const idx = people.findIndex((p) => p.id === id);
    if (idx === -1) {
      saved = null;
      return NO_CHANGE;
    }
    const u = typeof updates === "function" ? updates(people[idx]) : updates;
    people[idx] = { ...people[idx], ...u };
    saved = people[idx];
    return people;
  });
  return saved;
}

export async function deletePerson(id: string): Promise<boolean> {
  let removed = false;
  await changePeople((people) => {
    const filtered = people.filter((p) => p.id !== id);
    removed = filtered.length !== people.length;
    return removed ? filtered : NO_CHANGE;
  });
  return removed;
}

export async function getPeopleByPositions(
  positions: string[]
): Promise<Person[]> {
  const people = await getPeople();
  return people.filter((p) => positions.includes(p.position) && p.email);
}
