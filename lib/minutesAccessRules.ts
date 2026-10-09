import type { MeetingBody, MinutesAudience } from "./minutes";

// ---------------------------------------------------------------------------
// Who may READ a set of minutes. PURE, so the admin screen (a client
// component) and the check script can use it without the blob SDK.
//
// Carl, 9 Oct 2026: "only FINCOM should be able to read FINCOM unless
// otherwise set ... Admin should be able to set who sees which set of minutes
// per category (not every set of minutes, that would be cumbersome)."
//
// So access is set per meeting BODY (SGB, FINCOM, Other), never per record:
//  - "everyone": anybody signed in to this school.
//  - "tags": only holders of the chosen tags.
//
// Defaults, when the school has saved nothing for a body:
//  - FINCOM: the people the FINCOM minutes are DISTRIBUTED to (the To and Cc
//    tags under Minutes Admin). The school already said who FINCOM is there.
//  - SGB and Other: everyone, which is how the portal has always worked.
//
// 🔴 FAILS CLOSED. "tags" with no tags, or FINCOM with no distribution list
// yet, means only the people below, never everybody. An empty list must never
// widen ([[empty-audience-must-not-mean-everyone]]).
//
// Always allowed, whatever the setting: minutes managers (they write them),
// and anyone this particular set was sent to for checking or signing, who
// cannot do that without reading it.
// ---------------------------------------------------------------------------

export interface BodyAccess {
  mode: "everyone" | "tags";
  tagIds: string[];
}

export type MinutesAccessSettings = Partial<Record<MeetingBody, BodyAccess>>;

/** The permissions that manage minutes. Same list as the minutes routes. */
export const MINUTES_MANAGE_PERMISSIONS = ["manage_minutes", "manage_users"];

export const ACCESS_BODIES: MeetingBody[] = ["sgb", "fincom", "other"];

export const ACCESS_BODY_LABELS: Record<MeetingBody, string> = {
  sgb: "SGB minutes",
  fincom: "FINCOM minutes",
  other: "Other minutes",
};

/** The access in force for a body: what the school saved, else the default. */
export function effectiveAccess(
  body: MeetingBody,
  settings: MinutesAccessSettings,
  distribution: { to: Partial<Record<MinutesAudience, string>>; cc: Partial<Record<MinutesAudience, string>> }
): BodyAccess & { isDefault: boolean } {
  const saved = settings[body];
  if (saved && (saved.mode === "everyone" || saved.mode === "tags")) {
    return { mode: saved.mode, tagIds: [...new Set(saved.tagIds || [])], isDefault: false };
  }
  if (body === "fincom") {
    const tagIds = [distribution.to.fincom, distribution.cc.fincom].filter((t): t is string => !!t);
    return { mode: "tags", tagIds: [...new Set(tagIds)], isDefault: true };
  }
  return { mode: "everyone", tagIds: [], isDefault: true };
}

/** Everything the rule needs to know about the person asking. */
export interface MinutesViewer {
  /** lower-cased, trimmed */
  email: string;
  permissions: string[];
  /** Tags on their user account and on the register entry that is them. */
  tagIds: string[];
}

/** The parts of a set of minutes the rule reads. */
export interface MinutesForAccess {
  body: MeetingBody;
  reviewers?: { email: string }[];
  signatories?: { email: string }[];
}

const norm = (e: string | undefined) => String(e || "").trim().toLowerCase();

export function canReadMinutes(
  record: MinutesForAccess,
  viewer: MinutesViewer,
  access: BodyAccess
): boolean {
  if (viewer.permissions.some((p) => MINUTES_MANAGE_PERMISSIONS.includes(p))) return true;

  const me = norm(viewer.email);
  if (me) {
    const involved = [...(record.reviewers || []), ...(record.signatories || [])];
    if (involved.some((p) => norm(p.email) === me)) return true;
  }

  if (access.mode === "everyone") return true;
  // "tags": holders only. No tags chosen = nobody beyond the people above.
  return access.tagIds.some((t) => viewer.tagIds.includes(t));
}
