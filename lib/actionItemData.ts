import { readJson, updateJson, NO_CHANGE } from "./controlData";
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

// Tolerates a hand-edited or half-written file rather than throwing on read.
function tidy(store: ActionStore | null | undefined): ActionStore {
  return {
    items: Array.isArray(store?.items) ? store.items : [],
    nextRef: Number.isFinite(store?.nextRef) ? (store as ActionStore).nextRef : 1,
  };
}

async function readStore(): Promise<ActionStore> {
  return tidy(await readJson<ActionStore>(STORE_PATH, EMPTY));
}

// 🔴 Every write goes through updateJson (lib/controlData.ts): the store only
// accepts it if nobody wrote since it was read, otherwise the change is
// re-applied to the fresh copy. Before this, two saves at once kept one: five
// assignments sent together once left two, and the morning reminder run
// stamping its chases could wipe a progress update made the same minute.
//
// So `change` may run more than once and must only work from the store it is
// handed.
async function changeStore<R>(
  change: (store: ActionStore) => { result: R; write: boolean }
): Promise<R> {
  let result!: R;
  await updateJson<ActionStore>(STORE_PATH, EMPTY, (raw) => {
    const store = tidy(raw);
    const out = change(store);
    result = out.result;
    return out.write ? store : NO_CHANGE;
  });
  return result;
}

/** A change to one action: fields to set, or a function of the action AS IT IS
 *  NOW, for anything that adds to a list on it (an update note, a reminder
 *  stamp). Building that list from an earlier read loses whatever somebody
 *  else added in between. */
export type ActionChange =
  | Partial<Omit<ActionItem, "id" | "ref">>
  | ((current: ActionItem) => Partial<Omit<ActionItem, "id" | "ref">>);

function apply(item: ActionItem, change: ActionChange, at: string): ActionItem {
  const updates = typeof change === "function" ? change(item) : change;
  return normalise({ ...item, ...updates, updatedAt: at });
}

export async function getActionItems(): Promise<ActionItem[]> {
  return (await readStore()).items;
}

export async function getActionItemById(
  id: string
): Promise<ActionItem | undefined> {
  return (await readStore()).items.find((i) => i.id === id);
}

// Takes the next reference and the record together, in one guarded write, so
// two actions created moments apart cannot be handed the same reference.
export async function createActionItem(
  item: Omit<ActionItem, "ref">
): Promise<ActionItem> {
  return changeStore((store) => {
    const created = normalise({ ...item, ref: formatRef(store.nextRef) });
    store.items.push(created);
    store.nextRef += 1;
    return { result: created, write: true };
  });
}

// Creating a batch in ONE write, references assigned in the order given.
// Not a loop over createActionItem: one guarded write is also one reference
// range, so an import cannot interleave with another create mid-list.
export async function createActionItems(
  items: Omit<ActionItem, "ref">[]
): Promise<ActionItem[]> {
  return changeStore((store) => {
    const created = items.map((item, i) =>
      normalise({ ...item, ref: formatRef(store.nextRef + i) })
    );
    store.items.push(...created);
    store.nextRef += created.length;
    return { result: created, write: created.length > 0 };
  });
}

export async function updateActionItem(
  id: string,
  change: ActionChange
): Promise<ActionItem | null> {
  const at = new Date().toISOString();
  return changeStore((store) => {
    const idx = store.items.findIndex((i) => i.id === id);
    if (idx === -1) return { result: null, write: false };
    store.items[idx] = apply(store.items[idx], change, at);
    return { result: store.items[idx], write: true };
  });
}

// Applying many edits in ONE write. Nothing that changes more than one action
// may loop over updateActionItem: it is one guarded write per call, and a
// half-applied batch is worse than one that waits for its turn.
export async function updateActionItems(
  edits: { id: string; updates: ActionChange }[]
): Promise<{ saved: ActionItem[]; missing: string[] }> {
  const at = new Date().toISOString();
  return changeStore((store) => {
    const saved: ActionItem[] = [];
    const missing: string[] = [];
    for (const edit of edits) {
      const idx = store.items.findIndex((i) => i.id === edit.id);
      if (idx === -1) {
        missing.push(edit.id);
        continue;
      }
      store.items[idx] = apply(store.items[idx], edit.updates, at);
      saved.push(store.items[idx]);
    }
    return { result: { saved, missing }, write: saved.length > 0 };
  });
}

export async function deleteActionItem(id: string): Promise<boolean> {
  return changeStore((store) => {
    const next = store.items.filter((i) => i.id !== id);
    if (next.length === store.items.length) return { result: false, write: false };
    // nextRef is deliberately NOT rolled back: the deleted reference stays spent.
    store.items = next;
    return { result: true, write: true };
  });
}

/**
 * Claims today's scheduled chase for one action, in one guarded write.
 *
 * True means this run owns it: lastRemindedOn is set to today BEFORE any email
 * goes. False means another run already did today. Two cron runs overlapping
 * (Vercel can fire a job twice) used to both read "not chased today" and both
 * email everybody.
 */
export async function claimActionChase(id: string, today: string): Promise<boolean> {
  return changeStore((store) => {
    const idx = store.items.findIndex((i) => i.id === id);
    if (idx === -1 || store.items[idx].lastRemindedOn === today) return { result: false, write: false };
    store.items[idx] = { ...store.items[idx], lastRemindedOn: today, lastReminderResult: "sending..." };
    return { result: true, write: true };
  });
}
