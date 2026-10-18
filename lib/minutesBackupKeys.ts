// Where unsaved minutes typing is backed up in this browser, and which tab
// wrote it. Standalone (no lib/minutes import) so lib/useAuth can use it on
// sign-out without pulling in the minutes code.

/** This tab: a save here only clears a backup this tab wrote, and sign-out
 *  can tell this tab's backups from another open tab's. */
export const TAB_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

/** Per site, per person and per minutes: one browser can be signed in to
 *  more than one school, a shared computer has more than one secretary, and
 *  minutes ids are only unique within a school.
 *  "offered" holds backups found when the page opened, apart from this
 *  visit's own, so typing on this visit can never overwrite or remove them. */
export function backupKeys(host: string, userId: string, minutesId: string): { main: string; offered: string } {
  return {
    main: `minutes-draft:${host}:${userId}:${minutesId}`,
    offered: `minutes-draft-offered:${host}:${userId}:${minutesId}`,
  };
}

type Listing = (Pick<Storage, "key" | "getItem" | "removeItem"> & { readonly length: number }) | null;

function keysWith(store: NonNullable<Listing>, prefixes: string[]): string[] {
  const out: string[] = [];
  // Collected first: removing while walking the index skips keys.
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && prefixes.some((p) => k.startsWith(p))) out.push(k);
  }
  return out;
}

/** On sign-out: this person's backups on this site go with them. */
export function clearUserBackups(store: Listing, host: string, userId: string): void {
  try {
    if (!store) return;
    keysWith(store, [`minutes-draft:${host}:${userId}:`, `minutes-draft-offered:${host}:${userId}:`]).forEach((k) =>
      store.removeItem(k)
    );
  } catch {
    // Blocked storage holds nothing to clear.
  }
}

/** How many of this person's current backups were written by ANOTHER tab
 *  within the window: typing that may still be open, and unsaved, there. */
export function otherTabsUnsaved(
  store: Listing,
  host: string,
  userId: string,
  tabId: string,
  windowMs: number,
  now = Date.now()
): number {
  try {
    if (!store) return 0;
    return keysWith(store, [`minutes-draft:${host}:${userId}:`]).filter((k) => {
      try {
        const d = JSON.parse(store.getItem(k) || "null") as { editedAt?: string; tabId?: string } | null;
        return !!d && d.tabId !== tabId && !!d.editedAt && now - Date.parse(d.editedAt) < windowMs;
      } catch {
        return false;
      }
    }).length;
  } catch {
    return 0;
  }
}

/** Written on sign-out so other tabs hear of it (the storage event fires only
 *  in OTHER tabs). */
export const SIGNED_OUT_KEY = "minutes-signed-out";
