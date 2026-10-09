import { readJson, writeJson } from "./controlData";
import { getUserById, type User } from "./userData";
import { getPeople, type Person } from "./peopleData";
import { getRecipientSettings } from "./minutesRecipients";
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

/**
 * The tags that are this person's.
 *
 * A tag can sit on the user account OR on their People register entry, and
 * FINCOM is usually a register tag. The register entry counts when it is
 * linked to the account by an admin (person.userId), or carries the same
 * email. The email match is safe because an account's email can only be
 * changed to an address its owner has proved they receive.
 */
function tagsFor(user: Pick<User, "id" | "email" | "tagIds">, people: Person[]): string[] {
  const email = String(user.email || "").trim().toLowerCase();
  const tags = new Set<string>(user.tagIds || []);
  for (const p of people) {
    const mine =
      p.userId === user.id ||
      (!!email && String(p.email || "").trim().toLowerCase() === email);
    if (mine) for (const t of p.tagIds || []) tags.add(t);
  }
  return [...tags];
}

export interface MinutesAccessContext {
  settings: MinutesAccessSettings;
  distribution: Awaited<ReturnType<typeof getRecipientSettings>>;
  people: Person[];
}

/** Loaded once per request (or once per weekly send), then reused per record. */
export async function loadMinutesAccessContext(): Promise<MinutesAccessContext> {
  const [settings, distribution, people] = await Promise.all([
    getMinutesAccessSettings(),
    getRecipientSettings(),
    getPeople(),
  ]);
  return { settings, distribution, people };
}

export function viewerForUser(
  user: Pick<User, "id" | "email" | "tagIds">,
  permissions: string[],
  ctx: MinutesAccessContext
): MinutesViewer {
  return {
    email: String(user.email || "").trim().toLowerCase(),
    permissions,
    tagIds: tagsFor(user, ctx.people),
  };
}

export async function viewerForSession(
  session: SessionPayload,
  ctx: MinutesAccessContext
): Promise<MinutesViewer> {
  const user = await getUserById(session.id);
  return viewerForUser(
    { id: session.id, email: user?.email ?? session.email, tagIds: user?.tagIds },
    session.permissions,
    ctx
  );
}

export function viewerMayRead(
  record: MinutesForAccess,
  viewer: MinutesViewer,
  ctx: MinutesAccessContext
): boolean {
  return canReadMinutes(record, viewer, effectiveAccess(record.body, ctx.settings, ctx.distribution));
}

/** For a route about ONE set of minutes. False means answer 404, never 403:
 *  a FINCOM-only set should not even be confirmed to exist. */
export async function sessionMayReadMinutes(
  session: SessionPayload,
  record: MinutesForAccess
): Promise<boolean> {
  const ctx = await loadMinutesAccessContext();
  return viewerMayRead(record, await viewerForSession(session, ctx), ctx);
}

/** For a list: only the sets this person may read. */
export async function readableMinutes<T extends MinutesForAccess>(
  session: SessionPayload,
  records: T[]
): Promise<T[]> {
  const ctx = await loadMinutesAccessContext();
  const viewer = await viewerForSession(session, ctx);
  return records.filter((r) => viewerMayRead(r, viewer, ctx));
}
