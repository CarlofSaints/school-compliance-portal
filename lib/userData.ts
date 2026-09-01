import { readJson, writeJson, listFiles, deleteFile } from "./controlData";
import bcrypt from "bcryptjs";

export interface User {
  id: string;
  name: string;
  surname: string;
  email: string;
  password: string;
  role: string;
  forcePasswordChange: boolean;
  createdAt: string;
  updatedAt: string;
  // Tags naming this individual as part of a group (FINCOM, Principal...).
  // See lib/tagData.ts - a tag can sit on a User or on a Person.
  tagIds?: string[];
}

const USERS_PATH = "users.json";

// Each user also keeps their own copy, written BEFORE the shared index.
//
// users.json is one document that every create reads, appends to and writes
// back. Two creates close together overlap: the second reads the list before
// the first one's write has propagated, then saves that older list over the
// top, and the first user is gone with nothing left to recover them from. That
// is not theoretical here. It lost a real account, and the same shape lost five
// of nine policies before policies were given this treatment.
//
// This copy lives at a path only this user uses, so it cannot be lost to an
// overlapping write. It makes the index recoverable rather than authoritative:
// if an entry is dropped, repairUserIndex rebuilds it from these with the real
// name, email, role and password hash intact.
function recordPath(id: string): string {
  return `users/${id}/record.json`;
}

// A deleted user leaves a tombstone, because their record.json and avatar stay
// in storage. Without one, a repair would cheerfully restore an account that
// was deliberately removed, along with its login.
function tombstonePath(id: string): string {
  return `users/${id}/deleted.json`;
}

export async function getUsers(): Promise<User[]> {
  return readJson<User[]>(USERS_PATH, []);
}

export async function saveUsers(users: User[]): Promise<void> {
  return writeJson(USERS_PATH, users);
}

export async function saveUserRecord(user: User): Promise<void> {
  return writeJson(recordPath(user.id), user);
}

export async function getUserRecord(id: string): Promise<User | null> {
  return readJson<User | null>(recordPath(id), null);
}

export async function isUserDeleted(id: string): Promise<boolean> {
  const stone = await readJson<{ deletedAt: string } | null>(
    tombstonePath(id),
    null
  );
  return stone !== null;
}

export async function getUserById(id: string): Promise<User | undefined> {
  // The user's own copy first. It is written to a path only they use, so it is
  // readable the moment the account is created, whereas the shared index can
  // serve a pre-write copy for a surprisingly long time. Reading the index here
  // meant an account created seconds ago answered "not found".
  const own = await getUserRecord(id);
  if (own) return own;

  const users = await getUsers();
  return users.find((u) => u.id === id);
}

export async function getUserByEmail(
  email: string
): Promise<User | undefined> {
  const users = await getUsers();
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export async function createUser(
  user: Omit<User, "password" | "createdAt" | "updatedAt"> & {
    password: string;
  }
): Promise<User> {
  const users = await getUsers();
  const hashed = await bcrypt.hash(user.password, 10);
  const now = new Date().toISOString();
  const newUser: User = {
    ...user,
    password: hashed,
    createdAt: now,
    updatedAt: now,
  };

  // Own copy first. If appending to the shared index is the step that gets
  // lost, everything needed to put this account back is already safely stored.
  await saveUserRecord(newUser);
  users.push(newUser);
  await saveUsers(users);
  return newUser;
}

export async function updateUser(
  id: string,
  updates: Partial<Omit<User, "id" | "createdAt">>
): Promise<User | null> {
  const users = await getUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  if (updates.password) {
    updates.password = await bcrypt.hash(updates.password, 10);
  }
  users[idx] = { ...users[idx], ...updates, updatedAt: new Date().toISOString() };
  await saveUsers(users);
  // Keep the own copy in step, or a repair would restore this account as it was
  // before its last edit, including an old role or a superseded password.
  await saveUserRecord(users[idx]);
  return users[idx];
}

export async function deleteUser(id: string): Promise<boolean> {
  const users = await getUsers();
  const filtered = users.filter((u) => u.id !== id);
  if (filtered.length === users.length) return false;
  await saveUsers(filtered);
  await writeJson(tombstonePath(id), { deletedAt: new Date().toISOString() });
  await deleteFile(recordPath(id));
  return true;
}

// Rebuilds the shared index from the per-user copies.
//
// Only ever ADDS. An account present in the index is left exactly as it is, so
// running this can never undo an edit, and a tombstoned account is skipped so
// it can never resurrect a deletion.
export async function repairUserIndex(): Promise<{
  restored: { id: string; name: string; email: string }[];
  backfilled: number;
  scanned: number;
}> {
  const users = await getUsers();
  const known = new Set(users.map((u) => u.id));
  const ids = await listFiles("users");
  const restored: { id: string; name: string; email: string }[] = [];

  // Every account that predates this store keeping own copies gets one now.
  // Without it the accounts already on the portal stay exactly as recoverable
  // as the one that was lost, which is to say not at all.
  let backfilled = 0;
  for (const user of users) {
    if (await getUserRecord(user.id)) continue;
    await saveUserRecord(user);
    backfilled++;
  }

  for (const id of ids) {
    if (known.has(id)) continue;
    if (await isUserDeleted(id)) continue;

    const record = await getUserRecord(id);
    if (!record || !record.email) continue;

    // An account whose email has since been taken by somebody else must not
    // come back: two users with one email is a login nobody can resolve.
    if (users.some((u) => u.email.toLowerCase() === record.email.toLowerCase())) {
      continue;
    }

    users.push(record);
    known.add(id);
    restored.push({ id, name: `${record.name} ${record.surname}`.trim(), email: record.email });
  }

  if (restored.length > 0) await saveUsers(users);
  return { restored, backfilled, scanned: ids.length };
}

export async function verifyPassword(
  user: User,
  password: string
): Promise<boolean> {
  return bcrypt.compare(password, user.password);
}
