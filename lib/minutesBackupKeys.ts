// Where unsaved minutes typing is backed up in this browser, and which tab
// wrote it. Standalone (no lib/minutes import) so lib/useAuth can use it on
// sign-out without pulling in the minutes code.

/** This tab: a save here only clears a backup this tab wrote, and sign-out
 *  can tell this tab's backups from another open tab's. */
export const TAB_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

/** Per site, per person, per minutes and per tab: one browser can be signed
 *  in to more than one school, a shared computer has more than one
 *  secretary, minutes ids are only unique within a school, and two tabs on
 *  the same minutes must not overwrite each other's backup.
 *  main: this tab's own backup. tabsPrefix: every tab's backup of these
 *  minutes. offered: backups found when the page opened, apart from this
 *  visit's own, so typing on this visit can never overwrite or remove them. */
export function backupKeys(
  host: string,
  userId: string,
  minutesId: string,
  tabId: string = TAB_ID
): { main: string; tabsPrefix: string; offered: string } {
  const tabsPrefix = `minutes-draft:${host}:${userId}:${minutesId}:`;
  return { main: tabsPrefix + tabId, tabsPrefix, offered: `minutes-draft-offered:${host}:${userId}:${minutesId}` };
}

/** The "Compile a policy" draft, per site and per person, cleared on sign-out like the minutes backups. */
export function policyDraftKey(host: string, userId: string): string {
  return `policy-draft:${host}:${userId}:`;
}

type Listing = (Pick<Storage, "key" | "getItem" | "removeItem"> & { readonly length: number }) | null;

export function keysWith(store: NonNullable<Listing>, prefixes: string[]): string[] {
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
    keysWith(store, [`minutes-draft:${host}:${userId}:`, `minutes-draft-offered:${host}:${userId}:`, policyDraftKey(host, userId)]).forEach((k) =>
      store.removeItem(k)
    );
  } catch {
    // Blocked storage holds nothing to clear.
  }
}

/** How many of this person's backups were written by ANOTHER tab, of any
 *  age: typing that may still be open, and unsaved, there, and that signing
 *  out would clear. */
export function otherTabsUnsaved(store: Listing, host: string, userId: string, tabId: string): number {
  try {
    if (!store) return 0;
    return keysWith(store, [`minutes-draft:${host}:${userId}:`]).filter((k) => {
      try {
        const d = JSON.parse(store.getItem(k) || "null") as { tabId?: string } | null;
        return !!d && d.tabId !== tabId;
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
