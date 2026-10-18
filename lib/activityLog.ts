import { readJson, readJsonTolerant, writeJson, listFiles } from "./controlData";

// ---------------------------------------------------------------------------
// The audit trail. One per school, and the school can see its own.
//
// Carl: "there must be a detailed log of everything for each school, visible to
// the school and to me. audit trails (especially for funding apps) are very
// important."
//
// 🔴 ONE BLOB PER ENTRY. Never an array appended to.
//
// Every other list in this project is a JSON array that each write reads,
// appends to and saves back. That shape has lost real data here more than once:
// two writes in the same moment both read the old list and the second saves
// over the first. For most records that is bad. For an AUDIT LOG it is fatal,
// because the entries that vanish are exactly the ones written during busy
// moments, which are the ones somebody will later want to look at.
//
// So each entry is its own blob at a path nothing else uses, and writes cannot
// collide by construction. The path carries the timestamp so list() comes back
// in order, and the month partition keeps a listing from growing without bound.
//
//   activity/2026-09/2026-09-05T12:34:56.789Z-a1b2c3.json
//
// Sign-ins and sign-outs (entity "auth") go in their OWN partition,
// activity-auth/<month>/, because there are far more of them than of
// everything else and every view reads a whole month. The default view reads
// activity/ only; the "Sign in" filter reads activity-auth/; the month export
// reads both. 🔴 activity-auth is a sibling of activity/, never inside it:
// activityMonths() treats every folder under activity/ as a month.
//
// ---------------------------------------------------------------------------

export type ActivityEntity =
  | "spend"
  | "policy"
  | "document"
  | "user"
  | "role"
  | "person"
  | "action_item"
  | "minutes"
  | "compliance"
  | "branding"
  | "auth"
  | "system";

export interface ActivityEntry {
  id: string;
  /** ISO timestamp. Also the start of the pathname, so listing sorts by time. */
  at: string;

  // The actor is DENORMALISED on purpose. An audit trail records what was true
  // at the time: if a user is renamed or deleted a year later, the entry must
  // still say who did it. Looking the name up at read time would quietly
  // rewrite history.
  actorId?: string;
  actorName: string;
  actorEmail?: string;

  /** Dotted and stable, e.g. "spend.approved". Never shown raw to a user. */
  action: string;
  entity: ActivityEntity;
  entityId?: string;
  /** A plain sentence a person can read. This is what the grid shows. */
  summary: string;
  /** Before and after, or anything else worth keeping. Shown on drilldown. */
  detail?: Record<string, unknown>;
  /** Best effort. Behind a proxy this is the forwarded address. */
  ip?: string;
}

function monthOf(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

const folderFor = (entity?: ActivityEntity) => (entity === "auth" ? "activity-auth" : "activity");

function pathFor(entry: ActivityEntry): string {
  return `${folderFor(entry.entity)}/${monthOf(entry.at)}/${entry.at}-${entry.id.slice(0, 6)}.json`;
}

/**
 * Records an action. NEVER THROWS.
 *
 * Logging is a side effect of doing something, and a failure to log must not
 * fail the thing. A spend application that was approved but could not be
 * written to the log is still approved, and the caller must not be handed an
 * error that makes it look otherwise. The failure is written to the console so
 * it is visible in Vercel's logs.
 */
export async function recordActivity(
  entry: Omit<ActivityEntry, "id" | "at"> & { at?: string }
): Promise<void> {
  try {
    const full: ActivityEntry = {
      ...entry,
      id: crypto.randomUUID(),
      at: entry.at || new Date().toISOString(),
    };
    await writeJson(pathFor(full), full);
  } catch (err) {
    console.error("[activity] Could not record:", entry.action, err);
  }
}

// Who may read the audit trail, and so the sign-ins too. ANY-of, not one
// narrow key: a stored role that predates a new permission never gains it,
// so "view_activity" alone would lock out every existing admin.
export const ACTIVITY_VIEW_PERMISSIONS = ["view_activity", "manage_users", "manage_roles", "manage_spend_settings"];

export interface ActivityQuery {
  /** "YYYY-MM". Omit for the current month. */
  month?: string;
  /** How many to return. The grid pages; an export asks for everything. */
  limit?: number;
  /** Skip this many, oldest-first within the month is reversed before slicing. */
  offset?: number;
  entity?: ActivityEntity;
  actorId?: string;
  /** Case-insensitive match against the summary and the actor's name. */
  search?: string;
}

export interface ActivityPage {
  entries: ActivityEntry[];
  /** Total matching entries in the month, before paging. */
  total: number;
  month: string;
  /** Months that have any entries at all, newest first, for the month picker. */
  availableMonths: string[];
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Months with at least one entry (in either partition), newest first. */
export async function activityMonths(): Promise<string[]> {
  const [main, auth] = await Promise.all([listFiles("activity"), listFiles("activity-auth")]);
  return [...new Set([...main, ...auth])].filter((m) => /^\d{4}-\d{2}$/.test(m)).sort().reverse();
}

/** One partition's month, newest first. */
async function readMonth(folder: string, month: string): Promise<ActivityEntry[]> {
  const files = await listFiles(`${folder}/${month}`);
  // The pathname starts with the ISO timestamp, so this is chronological.
  // Reversed for the grid, because an audit log is read newest first.
  const ordered = [...files].sort().reverse();
  const loaded = await Promise.all(
    ordered.map((name) => readJsonTolerant<ActivityEntry | null>(`${folder}/${month}/${name}`, null))
  );
  return loaded.filter((e): e is ActivityEntry => e !== null);
}

/**
 * Reads a month of activity.
 *
 * Deliberately a month at a time. Reading every entry a school has ever
 * produced to render one page would be slow and would burn the account's shared
 * operation budget for nothing, and nobody looks at an audit log without
 * knowing roughly when.
 */
export async function readActivity(
  query: ActivityQuery = {}
): Promise<ActivityPage> {
  const month = query.month || currentMonth();
  const availableMonths = await activityMonths();

  // "auth" reads its own partition; everything else reads the main one,
  // so the default view never downloads a month of sign-ins.
  let entries = await readMonth(folderFor(query.entity), month);

  if (query.entity) entries = entries.filter((e) => e.entity === query.entity);
  if (query.actorId) entries = entries.filter((e) => e.actorId === query.actorId);
  if (query.search) {
    const needle = query.search.trim().toLowerCase();
    entries = entries.filter(
      (e) =>
        e.summary.toLowerCase().includes(needle) ||
        e.actorName.toLowerCase().includes(needle) ||
        e.action.toLowerCase().includes(needle)
    );
  }

  const total = entries.length;
  const offset = query.offset ?? 0;
  const limit = query.limit ?? 100;
  return {
    entries: entries.slice(offset, offset + limit),
    total,
    month,
    availableMonths,
  };
}

/** Every entry for a month, BOTH partitions merged by time, newest first,
 *  for export. No paging, no limit. */
export async function exportActivity(month: string): Promise<ActivityEntry[]> {
  const [main, auth] = await Promise.all([readMonth("activity", month), readMonth("activity-auth", month)]);
  return [...main, ...auth].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** CSV, oldest first, because that is how an audit trail is read end to end. */
export function activityToCsv(entries: ActivityEntry[]): string {
  const rows = [...entries].reverse();
  const esc = (v: unknown) => {
    let s = v == null ? "" : String(v);
    // Formula injection: Excel runs a cell starting with = + - @ (or a tab /
    // CR before one). A sign-in typed by a stranger reaches this file, so
    // every such cell gets a leading quote and opens as plain text.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    // Quote everything: a summary can contain a comma, a quote or a newline,
    // and a CSV that breaks on one row loses the rest of the file.
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = [
    "When",
    "Who",
    "Email",
    "What",
    "Action",
    "Type",
    "Record",
    "IP",
    "Detail",
  ];
  const lines = [header.map(esc).join(",")];
  for (const e of rows) {
    lines.push(
      [
        e.at,
        e.actorName,
        e.actorEmail || "",
        e.summary,
        e.action,
        e.entity,
        e.entityId || "",
        e.ip || "",
        e.detail ? JSON.stringify(e.detail) : "",
      ]
        .map(esc)
        .join(",")
    );
  }
  // BOM so Excel opens UTF-8 correctly. Without it a school name with an
  // accent arrives mangled, and this file is going to a school's auditor.
  return "﻿" + lines.join("\r\n");
}
