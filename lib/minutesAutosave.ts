// Keeping the minute-taker's typing safe: the merge after a reload, and the
// local backup on this device. Pure (storage is passed in), so
// scripts/check-minutes-autosave.ts can test it.
//
// Carl typed a whole set of minutes, pressed "Send for checking" without
// saving, and lost all of it to the reload afterwards.

import {
  ATTENDANCE_STATUS_LABELS,
  cleanAttendees,
  formatPeriod,
  isLocked,
  MEETING_BODY_LABELS,
  MINUTES_TEXT_FIELDS,
  type AttendanceStatus,
  type MeetingBody,
  type MeetingPeriod,
  type MinutesStatus,
} from "./minutes";

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

/** The one definition of "the text". */
export function textOf<P, S>(r: MinutesText<P, S>): MinutesText<P, S> {
  const out: Record<string, unknown> = {};
  for (const f of MINUTES_TEXT_FIELDS) out[f] = r[f];
  return out as unknown as MinutesText<P, S>;
}

/** When the words were last changed. Minutes from before textUpdatedAt
 *  existed fall back to updatedAt, the same on server and page, so the
 *  conflict guard is on for them too (a little strict until their first save
 *  sets the real thing). */
export function textBase(r: { textUpdatedAt?: string; updatedAt?: string }): string | undefined {
  return r.textUpdatedAt ?? r.updatedAt;
}

/** The save body: the text, and when the words it was edited from were last
 *  changed, so the server can refuse to save over somebody else's newer text. */
export function savePayload(r: MinutesText & { textUpdatedAt?: string; updatedAt?: string }) {
  return { ...textOf(r), baseTextUpdatedAt: textBase(r) };
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
 * save (hasUnsaved).
 * - Still editable: the server's workflow state with the local text, which
 *   autosave then saves.
 * - No longer editable: the SERVER text, because that is the document that
 *   was sent or signed; the local text comes back as "stranded" to copy.
 * - Somebody else changed the words meanwhile: never laid over silently. The
 *   local text stays on screen, still based on the OLD words (so the server
 *   keeps refusing it), and "conflict" carries their record to choose from.
 */
export function reconcile<
  T extends MinutesText & { status: MinutesStatus; updatedAt?: string; textUpdatedAt?: string }
>(
  server: T,
  local: T | null,
  hasUnsaved: boolean
): { record: T; stranded: MinutesText | null; conflict: T | null } {
  if (!local) return { record: server, stranded: null, conflict: null };
  // A read straight after a write can serve the copy from BEFORE it. What is
  // on screen came from a newer answer, so it wins, text and status alike.
  if (isOlder(server.updatedAt, local.updatedAt)) return { record: local, stranded: null, conflict: null };
  if (!hasUnsaved) return { record: server, stranded: null, conflict: null };
  if (!isTextEditable(server.status)) return { record: server, stranded: textOf(local), conflict: null };
  if (isOlder(textBase(local), textBase(server)) && !sameText(local, server)) {
    return {
      record: { ...server, ...textOf(local), textUpdatedAt: textBase(local) },
      stranded: null,
      conflict: server,
    };
  }
  return { record: { ...server, ...textOf(local) }, stranded: null, conflict: null };
}

/** The text as plain words, for a person to read and copy: everything the
 *  minute-taker typed, attendance (with who sent apologies), who is
 *  responsible. tr translates a label. */
export function plainText(d: MinutesText, tr: (s: string) => string): string {
  let period = "";
  try {
    period = formatPeriod(d.period as MeetingPeriod);
  } catch {
    // A malformed backup still shows its words.
  }
  const meeting = MEETING_BODY_LABELS[d.body as MeetingBody];
  const sections = (Array.isArray(d.sections) ? (d.sections as Record<string, unknown>[]) : []).map((s) => {
    const lines = [String(s.title ?? ""), String(s.body ?? "")];
    for (const a of cleanAttendees(s.attendees) ?? []) {
      const status = a.status ? ` (${tr(ATTENDANCE_STATUS_LABELS[a.status as AttendanceStatus])})` : "";
      lines.push(`${[a.position, a.name].filter(Boolean).join(": ")}${status}`);
    }
    const responsible = String(s.responsible ?? "").trim();
    if (responsible) lines.push(`${tr("Responsible")}: ${responsible}`);
    return lines.filter(Boolean).join("\n");
  });
  const heading = [meeting ? tr(meeting) : d.body, period].filter(Boolean).join(" · ");
  return [d.title, heading, "", sections.join("\n\n")].join("\n");
}

// ---- Local backup -----------------------------------------------------------
// Covers every way out a save cannot: closing the tab, a crash, an expired
// session, the sidebar. It lives only in this browser and is never sent
// anywhere; it is removed once a save is confirmed.

export interface MinutesDraft extends MinutesText {
  editedAt: string;
  /** The server's textUpdatedAt the edits were made on top of. */
  baseUpdatedAt?: string;
  /** The tab that wrote it: a save in one tab only clears its own backup,
   *  never another tab's. */
  tabId?: string;
}

// The keys themselves, and which tab wrote what: lib/minutesBackupKeys.ts.

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;

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
// The WORDS changed, not any write: a review or a signature does not count.
export function draftIsBehind(draft: MinutesDraft, server: { textUpdatedAt?: string; updatedAt?: string }): boolean {
  return isOlder(draft.baseUpdatedAt, textBase(server));
}

/** A backup another tab wrote moments ago: that tab is probably still open
 *  and typing, so its backup is left alone rather than offered here. */
export function fromLiveTab(draft: MinutesDraft, tabId: string, now = Date.now(), windowMs = 30_000): boolean {
  return !!draft.tabId && draft.tabId !== tabId && now - Date.parse(draft.editedAt) < windowMs;
}
