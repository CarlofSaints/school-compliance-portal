import { readJson, writeJson } from "./controlData";
import { getUserById, getUsers, type User } from "./userData";
import { getPeople, type Person } from "./peopleData";
import { getRecipientSettings } from "./minutesRecipients";
import { getRoles, resolveRolePermissions } from "./rolesData";
import { listMinutes, type MinutesRecord } from "./minutesData";
import type { SessionPayload } from "./roles";
import {
  canReadMinutes,
  effectiveAccess,
  type MinutesAccessSettings,
  type MinutesForAccess,
  type MinutesViewer,
} from "./minutesAccessRules";

// Storage and lookups for minutes read access. The rule itself is pure and
// lives in lib/minutesAccessRules.ts.

const PATH = "minutes-access.json";

export async function getMinutesAccessSettings(): Promise<MinutesAccessSettings> {
  return readJson<MinutesAccessSettings>(PATH, {});
}

export async function saveMinutesAccessSettings(next: MinutesAccessSettings): Promise<void> {
  await writeJson(PATH, next);
}

const norm = (e: string | undefined | null) => String(e || "").trim().toLowerCase();

/**
 * The People register entries that ARE this account.
 *
 * 🔴 Only the admin-made link (person.userId). NOT a matching email: a
 * register entry's email is never confirmed, and somebody allowed to edit
 * People could otherwise put their own address on a FINCOM-tagged entry, or
 * make one, and read FINCOM minutes.
 */
function ownPeople(userId: string, people: Person[]): Person[] {
  return people.filter((p) => p.userId === userId);
}

export interface MinutesAccessContext {
  settings: MinutesAccessSettings;
  distribution: Awaited<ReturnType<typeof getRecipientSettings>>;
  people: Person[];
}

/** Loaded once per request (or once per send), then reused per record. */
export async function loadMinutesAccessContext(): Promise<MinutesAccessContext> {
  const [settings, distribution, people] = await Promise.all([
    getMinutesAccessSettings(),
    getRecipientSettings(),
    getPeople(),
  ]);
  return { settings, distribution, people };
}

/** A viewer, plus the register entries that are them (for "is this my action"). */
export interface Reader {
  viewer: MinutesViewer;
  personIds: string[];
}

export function readerForUser(
  user: Pick<User, "id" | "email" | "tagIds">,
  permissions: string[],
  ctx: MinutesAccessContext
): Reader {
  const mine = ownPeople(user.id, ctx.people);
  const tags = new Set<string>(user.tagIds || []);
  for (const p of mine) for (const t of p.tagIds || []) tags.add(t);
  return {
    viewer: { email: norm(user.email), permissions, tagIds: [...tags] },
    personIds: mine.map((p) => p.id),
  };
}

/**
 * A reader for an email RECIPIENT, who may have no login (a governor on the
 * register only, or an address an admin added to a send list).
 *
 * With an account, it is exactly that account. Without one, the register
 * entries carrying that address count: those addresses were put on the list by
 * an admin, and email is the only thing that identifies such a person.
 */
export function readerForRecipient(
  email: string,
  ctx: MinutesAccessContext,
  users: User[],
  permissionsFor: (u: User) => string[]
): Reader {
  const e = norm(email);
  const user = users.find((u) => norm(u.email) === e);
  if (user) return readerForUser(user, permissionsFor(user), ctx);
  const theirs = ctx.people.filter((p) => !!e && norm(p.email) === e);
  return {
    viewer: { email: e, permissions: [], tagIds: [...new Set(theirs.flatMap((p) => p.tagIds || []))] },
    personIds: theirs.map((p) => p.id),
  };
}

/** Everything needed to decide for many people at once (sends, lists). */
export async function loadRecipientResolver(ctx: MinutesAccessContext) {
  const [users, roles] = await Promise.all([getUsers(), getRoles()]);
  const permissionsFor = (u: User) => resolveRolePermissions(u.role, roles.find((r) => r.id === u.role));
  return {
    users,
    forEmail: (email: string) => readerForRecipient(email, ctx, users, permissionsFor),
    forUser: (u: User) => readerForUser(u, permissionsFor(u), ctx),
  };
}

export async function readerForSession(session: SessionPayload, ctx: MinutesAccessContext): Promise<Reader> {
  const user = await getUserById(session.id);
  return readerForUser(
    { id: session.id, email: user?.email ?? session.email, tagIds: user?.tagIds },
    session.permissions,
    ctx
  );
}

export function viewerMayRead(record: MinutesForAccess, viewer: MinutesViewer, ctx: MinutesAccessContext): boolean {
  return canReadMinutes(record, viewer, effectiveAccess(record.body, ctx.settings, ctx.distribution));
}

/** For a route about ONE set of minutes. False means answer 404, never 403:
 *  a FINCOM-only set should not even be confirmed to exist. */
export async function sessionMayReadMinutes(session: SessionPayload, record: MinutesForAccess): Promise<boolean> {
  const ctx = await loadMinutesAccessContext();
  return viewerMayRead(record, (await readerForSession(session, ctx)).viewer, ctx);
}

/** For a list: only the sets this person may read. */
export async function readableMinutes<T extends MinutesForAccess>(session: SessionPayload, records: T[]): Promise<T[]> {
  const ctx = await loadMinutesAccessContext();
  const { viewer } = await readerForSession(session, ctx);
  return records.filter((r) => viewerMayRead(r, viewer, ctx));
}

// --- Actions raised in a meeting -------------------------------------------
//
// An action raised in a set of minutes says what that meeting decided ("write
// off the X family's arrears"), so it follows the minutes' read access. The
// people CARRYING it always see it: they cannot do it otherwise.

export interface ActionOrigin {
  fromMinutes?: { minutesId: string };
  assigneeIds: string[];
}

export function actionVisible(
  item: ActionOrigin,
  reader: Reader,
  minutesById: Map<string, MinutesForAccess>,
  ctx: MinutesAccessContext
): boolean {
  const id = item.fromMinutes?.minutesId;
  if (!id) return true;
  if (item.assigneeIds.some((a) => reader.personIds.includes(a))) return true;
  const record = minutesById.get(id);
  // The minutes were deleted: nothing left to protect but a title, and the
  // action itself still stands. Shown.
  if (!record) return true;
  return viewerMayRead(record, reader.viewer, ctx);
}

/**
 * The activity log, with entries about minutes this person may not read
 * stripped to a placeholder. Log readers (view_activity, roles, spend
 * settings) are not necessarily minutes readers, and a summary like
 * 'Signed "FINCOM: write-off of arrears"' is the title they must not see.
 */
export async function redactMinutesActivity<
  T extends { entity: string; entityId?: string; summary: string; detail?: Record<string, unknown> },
>(session: SessionPayload, entries: T[]): Promise<T[]> {
  if (!entries.some((e) => e.entity === "minutes" && e.entityId)) return entries;
  const [ctx, byId] = await Promise.all([loadMinutesAccessContext(), minutesIndex()]);
  const { viewer } = await readerForSession(session, ctx);
  return entries.map((e) => {
    if (e.entity !== "minutes" || !e.entityId) return e;
    const record = byId.get(e.entityId);
    if (!record || viewerMayRead(record, viewer, ctx)) return e;
    return { ...e, summary: "Activity on minutes you do not have access to", detail: undefined };
  });
}

/** The minutes, keyed by id, for actionVisible. */
export async function minutesIndex(): Promise<Map<string, MinutesRecord>> {
  return new Map((await listMinutes()).map((m) => [m.id, m]));
}

/** For a session reading the action register. */
export async function visibleActionsFor<T extends ActionOrigin>(session: SessionPayload, items: T[]): Promise<T[]> {
  if (!items.some((i) => i.fromMinutes?.minutesId)) return items;
  const [ctx, byId] = await Promise.all([loadMinutesAccessContext(), minutesIndex()]);
  const reader = await readerForSession(session, ctx);
  return items.filter((i) => actionVisible(i, reader, byId, ctx));
}
