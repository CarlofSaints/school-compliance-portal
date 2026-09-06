import { readJson, writeJson } from "./controlData";
import { getTags } from "./tagData";
import { getUsers } from "./userData";
import { getPeople } from "./peopleData";
import type { MeetingBody } from "./minutes";

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

/** The moments an email goes out, each with a To list and a Cc list. */
export type MinutesAudience =
  | "draft" // out for checking: Principal + Chair, cc deputy
  | "signing" // the signing copy
  | "signed" // once everyone has signed
  | "sgb" // distributing signed SGB minutes to the whole body
  | "fincom"; // the same for FINCOM

export const AUDIENCE_LABELS: Record<MinutesAudience, string> = {
  draft: "Draft, out for checking",
  signing: "Ready to sign",
  signed: "Signed and final",
  sgb: "All SGB minutes",
  fincom: "All FINCOM minutes",
};

export const AUDIENCE_HELP: Record<MinutesAudience, string> = {
  draft:
    "Who checks a draft. Usually the Principal and the SGB Chair, with the deputy copied in.",
  signing: "Who is asked to sign once the draft has been approved.",
  signed: "Who is told when a set of minutes has been fully signed.",
  sgb: "Everyone who should receive signed SGB minutes.",
  fincom: "Everyone who should receive signed FINCOM minutes.",
};

export interface MinutesRecipientSettings {
  /** audience -> the tag whose holders are the To list. */
  to: Partial<Record<MinutesAudience, string>>;
  /** audience -> the tag whose holders are copied in. */
  cc: Partial<Record<MinutesAudience, string>>;
}

const PATH = "minutes-recipients.json";

export async function getRecipientSettings(): Promise<MinutesRecipientSettings> {
  return readJson<MinutesRecipientSettings>(PATH, { to: {}, cc: {} });
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
async function holdersOf(tagId: string | undefined, why: string): Promise<{
  recipients: MinutesRecipient[];
  withoutEmail: string[];
}> {
  if (!tagId) return { recipients: [], withoutEmail: [] };

  const [users, people] = await Promise.all([getUsers(), getPeople()]);
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

  for (const u of users) {
    if (u.tagIds?.includes(tagId)) add(u.email, `${u.name} ${u.surname}`.trim());
  }
  for (const p of people) {
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

export async function resolveAudience(
  audience: MinutesAudience,
  settings?: MinutesRecipientSettings
): Promise<ResolvedAudience> {
  const s = settings ?? (await getRecipientSettings());
  const [toResult, ccResult] = await Promise.all([
    holdersOf(s.to[audience], AUDIENCE_LABELS[audience]),
    holdersOf(s.cc[audience], `${AUDIENCE_LABELS[audience]} (copied)`),
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

/** The distribution audience for a body, used by "send to the whole SGB". */
export function audienceForBody(body: MeetingBody): MinutesAudience {
  return body === "fincom" ? "fincom" : "sgb";
}

/** Which audiences have nothing configured, so the admin screen can say what is
 *  not set up rather than letting a secretary discover it mid-workflow. */
export async function unconfiguredAudiences(): Promise<MinutesAudience[]> {
  const s = await getRecipientSettings();
  return (Object.keys(AUDIENCE_LABELS) as MinutesAudience[]).filter(
    (a) => !s.to[a]
  );
}

/** Tags a school has, for the admin screen's dropdowns. */
export async function tagChoices(): Promise<{ id: string; name: string }[]> {
  return (await getTags()).map((t) => ({ id: t.id, name: t.name }));
}
