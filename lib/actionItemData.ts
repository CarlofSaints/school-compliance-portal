import { readJson, writeJson } from "./controlData";
import { formatRef, normalise } from "./actionItems";
import type { ActionItem } from "./actionItems";

// The store behind the action-item register.
//
// Split from lib/actionItems on purpose: this file reaches Vercel Blob, and the
// grid is a client component, so anything the browser needs lives in the pure
// half. Everything pure is re-exported here so server code has one import.
export * from "./actionItems";

// One file holds the register and the reference counter together.
//
// The counter cannot be derived from the items: deleting A-014 would hand the
// next action the same number, and two different actions with one reference is
// exactly the confusion the reference exists to prevent.
interface ActionStore {
  items: ActionItem[];
  nextRef: number;
}

const STORE_PATH = "action-items.json";

const EMPTY: ActionStore = { items: [], nextRef: 1 };

async function readStore(): Promise<ActionStore> {
  const store = await readJson<ActionStore>(STORE_PATH, EMPTY);
  // Tolerates a hand-edited or half-written file rather than throwing on read.
  return {
    items: Array.isArray(store?.items) ? store.items : [],
    nextRef: Number.isFinite(store?.nextRef) ? store.nextRef : 1,
  };
}

async function writeStore(store: ActionStore): Promise<void> {
  return writeJson(STORE_PATH, store);
}

export async function getActionItems(): Promise<ActionItem[]> {
  return (await readStore()).items;
}

export async function getActionItemById(
  id: string
): Promise<ActionItem | undefined> {
  return (await readStore()).items.find((i) => i.id === id);
}

// Takes the next reference and the record together, under one read and one
// write, so two actions created moments apart cannot be handed the same
// reference.
export async function createActionItem(
  item: Omit<ActionItem, "ref">
): Promise<ActionItem> {
  const store = await readStore();
  const created = normalise({ ...item, ref: formatRef(store.nextRef) });
  store.items.push(created);
  store.nextRef += 1;
  await writeStore(store);
  return created;
}

// Creating a batch under ONE read and ONE write.
//
// Not a loop over createActionItem. Every create is a read-modify-write of the
// whole file, so a run of them races itself across serverless instances: an
// instance reads the store from before its predecessor's write, appends its own
// row and saves, and the earlier row is gone. That is not theoretical here -
// nine policies uploaded one after another once landed as four
// ([[shared-index-read-lag]]). Importing a term's action list row by row would
// lose some of it, quietly.
//
// One read, one write, references assigned in the order given.
export async function createActionItems(
  items: Omit<ActionItem, "ref">[]
): Promise<ActionItem[]> {
  const store = await readStore();
  const created = items.map((item, i) =>
    normalise({ ...item, ref: formatRef(store.nextRef + i) })
  );
  store.items.push(...created);
  store.nextRef += created.length;
  await writeStore(store);
  return created;
}

export async function updateActionItem(
  id: string,
  updates: Partial<Omit<ActionItem, "id" | "ref">>
): Promise<ActionItem | null> {
  const store = await readStore();
  const idx = store.items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  store.items[idx] = normalise({
    ...store.items[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  });
  await writeStore(store);
  return store.items[idx];
}

// Applying many edits under ONE read and ONE write.
//
// Same hazard as createActionItems, and it is not theoretical either: five
// assignments sent one after another, each returning 200, left only two on the
// record. Every write reads the whole file, so a later write built on a read
// from before an earlier one simply erases it. Nothing that changes more than
// one action may loop over updateActionItem.
export async function updateActionItems(
  edits: { id: string; updates: Partial<Omit<ActionItem, "id" | "ref">> }[]
): Promise<{ saved: ActionItem[]; missing: string[] }> {
  const store = await readStore();
  const saved: ActionItem[] = [];
  const missing: string[] = [];
  const at = new Date().toISOString();

  for (const edit of edits) {
    const idx = store.items.findIndex((i) => i.id === edit.id);
    if (idx === -1) {
      missing.push(edit.id);
      continue;
    }
    store.items[idx] = normalise({
      ...store.items[idx],
      ...edit.updates,
      updatedAt: at,
    });
    saved.push(store.items[idx]);
  }

  if (saved.length > 0) await writeStore(store);
  return { saved, missing };
}

export async function deleteActionItem(id: string): Promise<boolean> {
  const store = await readStore();
  const next = store.items.filter((i) => i.id !== id);
  if (next.length === store.items.length) return false;
  // nextRef is deliberately NOT rolled back: the deleted reference stays spent.
  store.items = next;
  await writeStore(store);
  return true;
}
