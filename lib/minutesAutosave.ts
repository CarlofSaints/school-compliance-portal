// Keeping the minute-taker's typing safe: the merge after a reload, and the
// local backup on this device. Pure (storage is passed in), so
// scripts/check-minutes-autosave.ts can test it.
//
// Carl typed a whole set of minutes, pressed "Send for checking" without
// saving, and lost all of it to the reload afterwards.

import { isLocked, type MinutesStatus } from "./minutes";

/** Given to the panels that act on the SAVED copy (send, review, sign,
 *  distribute): saves any unsaved typing first. False means do not act;
 *  the page has already said why. */
export type SaveFirst = () => Promise<boolean>;

/** edit is bumped on every keystroke; saved is the edit the server last
 *  accepted. Unsaved is simply the two differing, whatever order saves and
 *  reloads finish in. */
export interface EditVersions {
  edit: number;
  saved: number;
}

export function hasUnsaved(v: EditVersions): boolean {
  return v.edit !== v.saved;
}

/** The fields the minute-taker types: exactly what a save sends. Everything
 *  else (status, signatures, reviews, draft number) belongs to the server. */
export interface MinutesText<P = unknown, S = unknown> {
  title: string;
  body: string;
  period: P;
  sections: S;
}

/** The save payload, and the one definition of "the text". */
export function textOf<P, S>(r: MinutesText<P, S>): MinutesText<P, S> {
  return { title: r.title, body: r.body, period: r.period, sections: r.sections };
}

export function sameText(a: MinutesText, b: MinutesText): boolean {
  return JSON.stringify(textOf(a)) === JSON.stringify(textOf(b));
}

/** Whether the words may still change at all. Out for signing they are
 *  frozen so everyone signs the same text; signed, they are the record. */
export function isTextEditable(status: MinutesStatus): boolean {
  return !isLocked(status) && status !== "awaiting_signatures";
}

/**
 * What the page shows after a reload, given typing newer than the last good
 * save (hasUnsaved). Still editable: the server's workflow state with the
 * local text, which autosave then saves. No longer editable: the SERVER text,
 * because that is the document that was sent or signed, and the local text
 * comes back separately as "stranded" so the page can show it to copy.
 */
export function reconcile<T extends MinutesText & { status: MinutesStatus }>(
  server: T,
  local: T | null,
  hasUnsaved: boolean
): { record: T; stranded: MinutesText | null } {
  if (!local || !hasUnsaved) return { record: server, stranded: null };
  if (!isTextEditable(server.status)) return { record: server, stranded: textOf(local) };
  return { record: { ...server, ...textOf(local) }, stranded: null };
}

// ---- Local backup -----------------------------------------------------------
// Covers every way out a save cannot: closing the tab, a crash, an expired
// session, the sidebar. It lives only in this browser and is never sent
// anywhere; it is removed once a save is confirmed.

export interface MinutesDraft extends MinutesText {
  editedAt: string;
  /** The server's updatedAt the edits were made on top of. */
  baseUpdatedAt?: string;
}

/** Per site as well as per minutes: one browser can be signed in to more
 *  than one school, and minutes ids are only unique within a school. */
export function backupKeyFor(host: string, minutesId: string): string {
  return `minutes-draft:${host}:${minutesId}`;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;

export function readDraft(store: Store, key: string): MinutesDraft | null {
  try {
    const raw = store?.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw);
    // Anything that is not a draft we wrote is ignored, never restored.
    if (
      !d ||
      typeof d.title !== "string" ||
      typeof d.body !== "string" ||
      typeof d.editedAt !== "string" ||
      !Array.isArray(d.sections) ||
      !d.period
    ) {
      return null;
    }
    return d as MinutesDraft;
  } catch {
    return null;
  }
}

export function writeDraft(store: Store, key: string, draft: MinutesDraft): void {
  try {
    store?.setItem(key, JSON.stringify(draft));
  } catch {
    // Full or blocked storage: the backup is a safety net, not the save.
  }
}

export function removeDraft(store: Store, key: string): void {
  try {
    store?.removeItem(key);
  } catch {
    // As above.
  }
}

/** A backup is only worth offering when it says something the server does not. */
export function draftToOffer(draft: MinutesDraft | null, server: MinutesText): MinutesDraft | null {
  return draft && !sameText(draft, server) ? draft : null;
}
