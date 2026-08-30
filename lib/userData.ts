import { readJson, writeJson } from "./controlData";
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

export async function getUsers(): Promise<User[]> {
  return readJson<User[]>(USERS_PATH, []);
}

export async function saveUsers(users: User[]): Promise<void> {
  return writeJson(USERS_PATH, users);
}

export async function getUserById(id: string): Promise<User | undefined> {
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
  return users[idx];
}

export async function deleteUser(id: string): Promise<boolean> {
  const users = await getUsers();
  const filtered = users.filter((u) => u.id !== id);
  if (filtered.length === users.length) return false;
  await saveUsers(filtered);
  return true;
}

export async function verifyPassword(
  user: User,
  password: string
): Promise<boolean> {
  return bcrypt.compare(password, user.password);
}
