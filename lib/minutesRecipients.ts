import { readJson, writeJson, updateJson } from "./controlData";
import { getTags } from "./tagData";
import { getUsers } from "./userData";
import { getPeople } from "./peopleData";
import type { MinutesRecipientSettings, MinutesStage, MeetingBody } from "./minutes";
import { stageTags, MINUTES_STAGES } from "./minutes";

// ---------------------------------------------------------------------------
// Who gets which minutes email.
//
// Carl: "In the user section, we can add tags for minutes: Send to for SGB
// Minutes, copy in for SGB minutes, Send to for FINCOM minutes, Copy in for
// FINCOM Minutes, Send to for Draft minutes, Copy in for Draft minutes, Send to
// for signed minutes, copy in for signed minutes etc."
//
// 🔴 The tag NAMES are not hard-coded. A school makes its own tags, and this
// records WHICH of them means what. Matching on a name like "SGB Minutes To"
// would break the moment somebody renamed a tag, capitalised it differently, or
// made one in Afrikaans.
//
// A tag sits on a User or on a Person, so somebody with no login still gets the
// minutes ([[authority-by-tag-not-role]] - a named person's power belongs on a
// tag, not a role).
// ---------------------------------------------------------------------------

// The audiences, their labels and which one a meeting body maps to are PURE,
// so they live in lib/minutes and are re-exported here where they are used -
// the same split as tags / tagData. It lets both the admin screen (a client
// component) and the check script reach them without pulling the blob SDK in.
export type { MinutesAudience } from "./minutes";
export { AUDIENCE_LABELS, AUDIENCE_HELP } from "./minutes";

export type { MinutesRecipientSettings } from "./minutes";

const PATH = "minutes-recipients.json";

export async function getRecipientSettings(): Promise<MinutesRecipientSettings> {
  return readJson<MinutesRecipientSettings>(PATH, { to: {}, cc: {} });
}

/** Saves ONE meeting type's lists, in one read-modify-write, leaving every
 *  other type (and the old school-wide lists they may still follow) alone. */
export async function saveRecipientSettingsFor(
  body: MeetingBody,
  stages: Partial<Record<MinutesStage, { to?: string; cc?: string }>>
): Promise<void> {
  await updateJson<MinutesRecipientSettings>(PATH, { to: {}, cc: {} }, (current) => ({
    ...current,
    byType: { ...(current.byType ?? {}), [body]: { ...(current.byType?.[body] ?? {}), ...stages } },
  }));
}

export async function saveRecipientSettings(
  next: MinutesRecipientSettings
): Promise<MinutesRecipientSettings> {
  await writeJson(PATH, next);
  return next;
}

export interface MinutesRecipient {
  email: string;
  name: string;
  /** Why they are on the list, for the audit entry and for the admin screen. */
  via: string;
}

/**
 * Everybody carrying a given tag, as addresses.
 *
 * Resolved at SEND TIME, never stored on the minutes. A person added to the
 * FINCOM tag today should receive the next set of FINCOM minutes without
 * anybody remembering to update a list.
 */
type Directory = { users: Awaited<ReturnType<typeof getUsers>>; people: Awaited<ReturnType<typeof getPeople>> };
const loadDirectory = async (): Promise<Directory> => {
  const [users, people] = await Promise.all([getUsers(), getPeople()]);
  return { users, people };
};

async function holdersOf(tagId: string | undefined, why: string, dir?: Directory): Promise<{
  recipients: MinutesRecipient[];
  withoutEmail: string[];
}> {
  if (!tagId) return { recipients: [], withoutEmail: [] };

  const { users, people } = dir ?? (await loadDirectory());
  const recipients: MinutesRecipient[] = [];
  const withoutEmail: string[] = [];
  const seen = new Set<string>();

  const add = (email: string | undefined, name: string) => {
    const clean = (email || "").trim().toLowerCase();
    if (!clean) {
      // Named rather than silently dropped. Somebody who is meant to receive
      // the minutes and has no address is a gap the secretary must be able to
      // see, not a silent omission discovered at the next meeting.
      withoutEmail.push(name);
      return;
    }
    if (seen.has(clean)) return; // tagged as both a user and a person
    seen.add(clean);
    recipients.push({ email: clean, name: name || clean, via: why });
  };

  // A member locked when the term ended, or retired, is not sent the minutes,
  // neither as a user nor through a People register entry linked to them.
  const blocked = users.filter((u) => u.retiredAt || u.termLocked);
  const blockedIds = new Set(blocked.map((u) => u.id));
  const blockedEmails = new Set(blocked.map((u) => u.email.trim().toLowerCase()));
  for (const u of users) {
    if (blockedIds.has(u.id)) continue;
    if (u.tagIds?.includes(tagId)) add(u.email, `${u.name} ${u.surname}`.trim());
  }
  for (const p of people) {
    if ((p.userId && blockedIds.has(p.userId)) || blockedEmails.has((p.email || "").trim().toLowerCase())) continue;
    if (p.tagIds?.includes(tagId)) {
      // A Person linked to a User is the same human; the user loop already
      // added them and `seen` keeps them off the list twice.
      // A Person has one `name` field, unlike a User which splits it.
      add(p.email, p.name);
    }
  }

  return { recipients, withoutEmail };
}

export interface ResolvedAudience {
  to: MinutesRecipient[];
  cc: MinutesRecipient[];
  /** People on a list who have no email address. Shown, never ignored. */
  withoutEmail: string[];
  /** True when nobody at all would be emailed, so the caller can refuse rather
   *  than report a send that reached nobody. */
  empty: boolean;
}

/**
 * Who a set of minutes of this TYPE reaches at this STAGE. The one entry point
 * for every send (checking, signing, the final copy) and for the previews, so
 * a preview can never name different people from the send.
 */
export async function resolveStage(
  stage: MinutesStage,
  body: MeetingBody,
  settings?: MinutesRecipientSettings,
  dir?: Directory
): Promise<ResolvedAudience> {
  const s = settings ?? (await getRecipientSettings());
  const tags = stageTags(s, body, stage);
  const label = MINUTES_STAGES.find((x) => x.key === stage)!.label;
  const d = dir ?? (tags.to || tags.cc ? await loadDirectory() : undefined);
  const [toResult, ccResult] = await Promise.all([
    holdersOf(tags.to, label, d),
    holdersOf(tags.cc, `${label} (copied)`, d),
  ]);

  // Somebody on both lists is on the To list only. A duplicate address makes a
  // recipient look at two copies and wonder which is the real one.
  const toEmails = new Set(toResult.recipients.map((r) => r.email));
  const cc = ccResult.recipients.filter((r) => !toEmails.has(r.email));

  return {
    to: toResult.recipients,
    cc,
    withoutEmail: [...new Set([...toResult.withoutEmail, ...ccResult.withoutEmail])],
    empty: toResult.recipients.length === 0,
  };
}

/**
 * The distribution audience for a body, used by "send to the whole SGB".
 *
 * 🔴 "Other" falls back to the SGB list rather than to nothing. A school
 * minuting a disciplinary panel still has to be able to circulate it, and
 * minutes that reach nobody with no error to explain why is the worse failure.
 *
 * Lives in lib/minutes (pure) so the check script can reach it without
 * importing the storage layer; re-exported here where it is used.
 */
export { audienceForBody } from "./minutes";

export { loadDirectory };

/** Tags a school has, for the admin screen's dropdowns. */
export async function tagChoices(): Promise<{ id: string; name: string }[]> {
  return (await getTags()).map((t) => ({ id: t.id, name: t.name }));
}
