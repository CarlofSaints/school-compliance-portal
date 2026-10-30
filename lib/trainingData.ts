import { randomUUID } from "crypto";
import {
  readJson,
  writeJson,
  updateJson,
  NO_CHANGE,
  addToList,
  updateInList,
  removeFromList,
  writeFile,
  readFile,
  deleteFile,
} from "./controlData";
import { getUsers } from "./userData";
import {
  emptyProgress,
  type Attempt,
  type Material,
  type Progress,
  type Test,
  type TrainingModule,
  type TrainingSource,
} from "./training";

// Storage for training. Everything goes through controlData, which is already
// scoped to the current school, so one school's courses and scores never
// reach another.
//
// - training/materials.json, tests.json, modules.json: guarded lists (two
//   admins saving at once both keep their change).
// - training/files/<materialId>.<ext>: an uploaded document.
// - training/progress/<userId>.json: one per person, written only by that
//   person's own actions, so a busy test never loses anybody's result.

const MATERIALS = "training/materials.json";
const TESTS = "training/tests.json";
const MODULES = "training/modules.json";
const progressPath = (userId: string) => `training/progress/${userId}.json`;
const filePath = (id: string, ext: string) => `training/files/${id}.${ext}`;

export const getMaterials = () => readJson<Material[]>(MATERIALS, []);
export const getTests = () => readJson<Test[]>(TESTS, []);
export const getModules = () => readJson<TrainingModule[]>(MODULES, []);

export async function getMaterial(id: string) {
  return (await getMaterials()).find((m) => m.id === id) ?? null;
}
export async function getTest(id: string) {
  return (await getTests()).find((t) => t.id === id) ?? null;
}
export async function getModule(id: string) {
  return (await getModules()).find((m) => m.id === id) ?? null;
}

type Kind = "material" | "test" | "module";
const LISTS: Record<Kind, string> = { material: MATERIALS, test: TESTS, module: MODULES };

export function stamp(by: string, source: TrainingSource = "manual") {
  const now = new Date().toISOString();
  return { id: randomUUID(), source, createdBy: by, createdAt: now, updatedAt: now };
}

export async function createItem<T extends { id: string }>(kind: Kind, item: T): Promise<T> {
  await addToList(LISTS[kind], item);
  return item;
}

/** Several at once, in ONE guarded write. */
export async function createItems<T extends { id: string }>(kind: Kind, items: T[]): Promise<void> {
  await addToList(LISTS[kind], ...items);
}

/** Publishes the listed pieces in ONE guarded write per list. */
export async function publishItems(kind: "material" | "test", ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  await updateJson<{ id: string; status: string; updatedAt: string }[]>(LISTS[kind], [], (list) =>
    list.some((x) => ids.includes(x.id) && x.status !== "published")
      ? list.map((x) => (ids.includes(x.id) && x.status !== "published" ? { ...x, status: "published", updatedAt: now } : x))
      : NO_CHANGE
  );
}

/** Applies `change` to one item under the guarded write. Null when it is gone. */
export async function updateItem<T extends { id: string; updatedAt: string }>(
  kind: Kind,
  id: string,
  change: (current: T) => Partial<T>
): Promise<T | null> {
  return updateInList<T>(LISTS[kind], id, (current) => ({
    ...current,
    ...change(current),
    id,
    updatedAt: new Date().toISOString(),
  }));
}

export async function deleteItem(kind: Kind, id: string): Promise<boolean> {
  const removed = await removeFromList<{ id: string; file?: { ext: string } }>(LISTS[kind], id);
  if (!removed) return false;
  if (kind === "material" && removed.file) await deleteFile(filePath(id, removed.file.ext)).catch(() => {});
  // Out of every module too, so no module points at nothing.
  if (kind !== "module") {
    await updateJson<TrainingModule[]>(MODULES, [], (mods) =>
      mods.some((m) => m.items.some((i) => i.kind === kind && i.id === id))
        ? mods.map((m) => ({ ...m, items: m.items.filter((i) => !(i.kind === kind && i.id === id)) }))
        : NO_CHANGE
    );
  }
  return true;
}

export const saveMaterialFile = (id: string, ext: string, data: Buffer) => writeFile(filePath(id, ext), data);
export const readMaterialFile = (id: string, ext: string) => readFile(filePath(id, ext));
export const removeMaterialFile = (id: string, ext: string) => deleteFile(filePath(id, ext));

// --- Progress ----------------------------------------------------------------

export async function getProgress(userId: string): Promise<Progress> {
  return readJson<Progress>(progressPath(userId), emptyProgress(userId));
}

/** Replaces a person's whole record. Only the demo school's seed uses this. */
export const saveProgress = (p: Progress) => writeJson(progressPath(p.userId), p);

/** Records the FIRST time somebody opens a piece of material. */
export async function markOpened(userId: string, materialId: string): Promise<void> {
  await updateJson<Progress>(progressPath(userId), emptyProgress(userId), (p) =>
    p.opened[materialId] ? NO_CHANGE : { ...p, opened: { ...p.opened, [materialId]: new Date().toISOString() } }
  );
}

/**
 * Marks and stores a paper in ONE guarded write, so the attempts count is
 * checked against the stored list and a double-click cannot sit a paper twice
 * past its limit.
 */
export async function recordAttempt(
  userId: string,
  make: (p: Progress) => Attempt | "no_attempts_left"
): Promise<Attempt | "no_attempts_left"> {
  let result: Attempt | "no_attempts_left" = "no_attempts_left";
  await updateJson<Progress>(progressPath(userId), emptyProgress(userId), (p) => {
    result = make(p);
    if (result === "no_attempts_left") return NO_CHANGE;
    // The sitting is over: the next opening of a timed paper starts a new clock.
    const { [result.testId]: _done, ...started } = p.started ?? {};
    return { ...p, attempts: [...p.attempts, result], started };
  });
  return result;
}

/** Starts the clock on a timed paper the FIRST time it is opened for a sitting. Reloading keeps the clock. */
export async function startSitting(userId: string, testId: string): Promise<Progress> {
  return updateJson<Progress>(progressPath(userId), emptyProgress(userId), (p) =>
    p.started?.[testId] ? NO_CHANGE : { ...p, started: { ...(p.started ?? {}), [testId]: new Date().toISOString() } }
  );
}

/** Everybody's progress, for the leaderboard. */
export async function allProgress(): Promise<{ users: Awaited<ReturnType<typeof getUsers>>; progress: Map<string, Progress> }> {
  // Retired members leave the board; a member locked by a term ending stays until decided.
  const users = (await getUsers()).filter((u) => !u.retiredAt);
  const entries = await Promise.all(users.map(async (u) => [u.id, await getProgress(u.id)] as const));
  return { users, progress: new Map(entries) };
}
