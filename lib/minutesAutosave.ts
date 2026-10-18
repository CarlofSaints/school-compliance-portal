// Keeping the minute-taker's typing safe: the merge after a reload, and the
// local backup on this device. Pure (storage is passed in), so
// scripts/check-minutes-autosave.ts can test it.
//
// Carl typed a whole set of minutes, pressed "Send for checking" without
// saving, and lost all of it to the reload afterwards.

import { cleanAttendees, isLocked, type MinutesStatus } from "./minutes";

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

// Empty means absent: the server drops false, "" and [] fields on save.
function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === false || v === "" || (Array.isArray(v) && v.length === 0);
}

/** JSON with sorted keys and empty fields left out, so two copies of the same
 *  words compare equal whatever order their fields were written in. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => !isEmpty(o[k]))
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/** The words as they matter, not as they were stored. The save (PATCH
 *  /api/minutes/[id]) rebuilds each section field by field: it trims, cleans
 *  the attendance rows, renumbers and adds an empty Apologies section. None
 *  of that is a change the minute-taker made, so none of it may raise an
 *  "unsaved changes" banner. Keep this in step with that route. */
function normalText(t: MinutesText): string {
  const sections = Array.isArray(t.sections)
    ? (t.sections as Record<string, unknown>[])
        .filter((s) => !(s?.kind === "apologies" && !String(s.body ?? "").trim()))
        .map((s) => {
          const kind = s?.kind === "attendance" || s?.kind === "apologies" ? s.kind : undefined;
          // Not id or order: the server assigns those.
          return {
            title: String(s?.title ?? "").trim(),
            body: String(s?.body ?? "").trim(),
            numberingStartsHere: s?.numberingStartsHere || undefined,
            personIds: s?.personIds,
            responsible: String(s?.responsible ?? "").trim() || undefined,
            kind,
            attendees: kind === "attendance" ? cleanAttendees(s.attendees) : undefined,
          };
        })
    : t.sections;
  return stable({ title: String(t.title ?? "").trim(), body: t.body, period: t.period, sections });
}

export function sameText(a: MinutesText, b: MinutesText): boolean {
  return normalText(a) === normalText(b);
}

/** ISO timestamps compare as strings. Unknown is never "older". */
export function isOlder(a?: string, b?: string): boolean {
  return !!a && !!b && a < b;
}

/** What a failed save means. signed-out: on the way to sign-in. transient:
 *  worth retrying (timeout, too many requests, server trouble). refused: the
 *  same text will be refused again (invalid, not allowed, locked, gone). */
export function saveFailureKind(status: number): "signed-out" | "transient" | "refused" {
  if (status === 401) return "signed-out";
  if (status === 408 || status === 429 || status >= 500) return "transient";
  return "refused";
}

/** How long to wait before retrying the nth consecutive failure (1-based),
 *  honouring a Retry-After header (seconds or a date), capped at 5 minutes. */
export function retryDelayMs(failures: number, retryAfter: string | null, now = Date.now()): number {
  const steps = [5000, 15000, 30000];
  const backoff = steps[Math.min(Math.max(failures, 1), steps.length) - 1];
  let asked = 0;
  if (retryAfter) {
    const secs = Number(retryAfter);
    asked = Number.isFinite(secs) ? secs * 1000 : Date.parse(retryAfter) - now;
    if (!Number.isFinite(asked)) asked = 0;
  }
  return Math.min(Math.max(backoff, asked), 5 * 60_000);
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
export function reconcile<T extends MinutesText & { status: MinutesStatus; updatedAt?: string }>(
  server: T,
  local: T | null,
  hasUnsaved: boolean
): { record: T; stranded: MinutesText | null } {
  if (!local) return { record: server, stranded: null };
  // A read straight after a write can serve the copy from BEFORE it. What is
  // on screen came from a newer answer, so it wins, text and status alike.
  if (isOlder(server.updatedAt, local.updatedAt)) return { record: local, stranded: null };
  if (!hasUnsaved) return { record: server, stranded: null };
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

/** Per site, per person and per minutes: one browser can be signed in to
 *  more than one school, a shared computer has more than one secretary, and
 *  minutes ids are only unique within a school.
 *  "offered" holds a backup found when the page opened, apart from this
 *  visit's own, so typing on this visit can never overwrite or remove it. */
export function backupKeys(host: string, userId: string, minutesId: string): { main: string; offered: string } {
  return {
    main: `minutes-draft:${host}:${userId}:${minutesId}`,
    offered: `minutes-draft-offered:${host}:${userId}:${minutesId}`,
  };
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;

/** On sign-out: this person's backups on this site go with them. */
export function clearUserBackups(
  store: (Pick<Storage, "key" | "removeItem"> & { readonly length: number }) | null,
  host: string,
  userId: string
): void {
  try {
    if (!store) return;
    const prefixes = [`minutes-draft:${host}:${userId}:`, `minutes-draft-offered:${host}:${userId}:`];
    const mine: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && prefixes.some((p) => k.startsWith(p))) mine.push(k);
    }
    // Collected first: removing while walking the index skips keys.
    mine.forEach((k) => store.removeItem(k));
  } catch {
    // Blocked storage holds nothing to clear.
  }
}

/** Anything that is not a draft we wrote is ignored, never restored. */
function asDraft(d: unknown): MinutesDraft | null {
  const o = d as Partial<MinutesDraft> | null;
  if (
    !o ||
    typeof o.title !== "string" ||
    typeof o.body !== "string" ||
    typeof o.editedAt !== "string" ||
    !Array.isArray(o.sections) ||
    !o.period
  ) {
    return null;
  }
  return o as MinutesDraft;
}

export function readDraft(store: Store, key: string): MinutesDraft | null {
  try {
    const raw = store?.getItem(key);
    return raw ? asDraft(JSON.parse(raw)) : null;
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

/** Backups found on opening, kept apart from this visit's own. A list, newest
 *  first, so a newer backup never silently replaces an older one; capped at
 *  three, and anything the server already holds is dropped. */
export const MAX_OFFERED = 3;

export function readOffered(store: Store, key: string): MinutesDraft[] {
  try {
    const raw = store?.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
    return list.map(asDraft).filter((d): d is MinutesDraft => d !== null);
  } catch {
    return [];
  }
}

export function writeOffered(store: Store, key: string, list: MinutesDraft[]): void {
  try {
    if (list.length) store?.setItem(key, JSON.stringify(list));
    else store?.removeItem(key);
  } catch {
    // Full or blocked storage, as for writeDraft.
  }
}

/** The list to offer once a new backup (fresh, may be null) has joined it. */
export function mergeOffered(existing: MinutesDraft[], fresh: MinutesDraft | null, server: MinutesText): MinutesDraft[] {
  const all = fresh ? [fresh, ...existing] : existing;
  const out: MinutesDraft[] = [];
  for (const d of [...all].sort((a, b) => b.editedAt.localeCompare(a.editedAt))) {
    if (sameText(d, server) || out.some((o) => sameText(o, d))) continue;
    out.push(d);
  }
  return out.slice(0, MAX_OFFERED);
}

/** The saved minutes changed after the backup's edits began (someone else, or
 *  this person on another device), so restoring it would replace newer text. */
export function draftIsBehind(draft: MinutesDraft, server: { updatedAt?: string }): boolean {
  return isOlder(draft.baseUpdatedAt, server.updatedAt);
}
