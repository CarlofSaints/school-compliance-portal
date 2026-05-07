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
}

const PEOPLE_PATH = "people.json";

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
