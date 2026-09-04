import { readJson, writeJson } from "./controlData";
import { getUsers } from "./userData";
import { getPeople } from "./peopleData";
import type { Tag } from "./tags";

// The types and colour constants live in lib/tags.ts so a client component can
// import them without pulling this module - and therefore the whole storage
// layer - into the browser bundle. Re-exported here so every existing
// server-side `from "@/lib/tagData"` keeps working.
export * from "./tags";

const TAGS_PATH = "tags.json";

export async function getTags(): Promise<Tag[]> {
  const tags = await readJson<Tag[]>(TAGS_PATH, []);
  return [...tags].sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveTags(tags: Tag[]): Promise<void> {
  return writeJson(TAGS_PATH, tags);
}

export async function getTagById(id: string): Promise<Tag | undefined> {
  return (await getTags()).find((t) => t.id === id);
}

export async function createTag(tag: Tag): Promise<void> {
  const tags = await getTags();
  tags.push(tag);
  await saveTags(tags);
}

export async function updateTag(
  id: string,
  updates: Partial<Omit<Tag, "id">>
): Promise<Tag | null> {
  const tags = await getTags();
  const idx = tags.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  tags[idx] = { ...tags[idx], ...updates };
  await saveTags(tags);
  return tags[idx];
}

export async function deleteTag(id: string): Promise<boolean> {
  const tags = await getTags();
  const next = tags.filter((t) => t.id !== id);
  if (next.length === tags.length) return false;
  await saveTags(next);
  return true;
}

// --- Membership -----------------------------------------------------------

export interface TagMember {
  // Stable identity for comparing an approval against a requirement. A member
  // who has a login is keyed by user id; otherwise by person id.
  key: string;
  userId?: string;
  personId?: string;
  name: string;
  email: string;
  // Where the tag was found, so the UI can explain a surprising member.
  source: "user" | "person";
}

// Everyone carrying a tag, from both sides. A person linked to a user resolves
// to that user, so somebody tagged on both sides is only ever counted once and
// the approval they give as a logged-in user satisfies the requirement.
export async function getTagMembers(tagId: string): Promise<TagMember[]> {
  const [users, people] = await Promise.all([getUsers(), getPeople()]);
  const byKey = new Map<string, TagMember>();

  for (const u of users) {
    if (u.tagIds?.includes(tagId)) {
      byKey.set(u.id, {
        key: u.id,
        userId: u.id,
        name: `${u.name} ${u.surname}`.trim(),
        email: u.email,
        source: "user",
      });
    }
  }

  for (const p of people) {
    if (!p.tagIds?.includes(tagId)) continue;
    // A person wired to a user is that user for approval purposes.
    if (p.userId) {
      if (byKey.has(p.userId)) continue;
      const u = users.find((x) => x.id === p.userId);
      if (u) {
        byKey.set(u.id, {
          key: u.id,
          userId: u.id,
          personId: p.id,
          name: `${u.name} ${u.surname}`.trim(),
          email: u.email,
          source: "person",
        });
        continue;
      }
    }
    // No login: they can still be emailed and recorded, they just cannot
    // click Approve themselves.
    byKey.set(`person:${p.id}`, {
      key: `person:${p.id}`,
      personId: p.id,
      name: p.name || p.position,
      email: p.email,
      source: "person",
    });
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Counts per tag, for the tags admin page.
export async function getTagCounts(): Promise<Record<string, number>> {
  const [users, people] = await Promise.all([getUsers(), getPeople()]);
  const counts: Record<string, number> = {};
  const bump = (id: string) => {
    counts[id] = (counts[id] || 0) + 1;
  };
  for (const u of users) for (const id of u.tagIds || []) bump(id);
  for (const p of people) {
    // Skip a person already counted through their linked user.
    if (p.userId && users.some((u) => u.id === p.userId)) continue;
    for (const id of p.tagIds || []) bump(id);
  }
  return counts;
}
