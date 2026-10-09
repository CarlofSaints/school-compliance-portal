import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import {
  getMinutesAccessSettings,
  saveMinutesAccessSettings,
  loadMinutesAccessContext,
  loadRecipientResolver,
} from "@/lib/minutesAccess";
import { tagChoices } from "@/lib/minutesRecipients";
import {
  ACCESS_BODIES,
  MINUTES_MANAGE_PERMISSIONS,
  effectiveAccess,
  type MinutesAccessSettings,
} from "@/lib/minutesAccessRules";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

// Who may READ each category of minutes (Admin -> Minutes Admin -> "Who can
// read minutes"). The rule is in lib/minutesAccessRules.ts.
//
// GET returns the setting in force per body AND the names it currently lets
// in, so an admin sees people rather than trusting that a tag is right.

export async function GET(req: NextRequest) {
  const session = await requireAnyPermission(req, MINUTES_MANAGE_PERMISSIONS);
  if (session instanceof NextResponse) return session;

  const [ctx, tags] = await Promise.all([loadMinutesAccessContext(), tagChoices()]);
  const resolver = await loadRecipientResolver(ctx);

  // Worked out with the SAME rule as the real check, so this list cannot say
  // someone is in who is actually out. A tag on a register entry counts only
  // when that entry is linked to the person's login (Admin, People).
  const holders = (tagIds: string[]) =>
    resolver.users
      .filter((u) => resolver.forUser(u).viewer.tagIds.some((t) => tagIds.includes(t)))
      .map((u) => `${u.name} ${u.surname}`.trim())
      .filter(Boolean)
      .sort();

  const access = Object.fromEntries(
    ACCESS_BODIES.map((body) => {
      const eff = effectiveAccess(body, ctx.settings, ctx.distribution);
      return [body, { ...eff, readers: eff.mode === "tags" ? holders(eff.tagIds) : [] }];
    })
  );

  return NextResponse.json({ access, tags }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: NextRequest) {
  const session = await requireAnyPermission(req, MINUTES_MANAGE_PERMISSIONS);
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Could not read that request" }, { status: 400 });
  }

  // Only known bodies, only the two modes (or "default", which removes the
  // saved choice so the body follows its default again), only tags that
  // exist. Anything else is dropped rather than stored, so a bad save cannot
  // widen access by writing a mode the rule does not understand.
  //
  // 🔴 Only the bodies SENT change. The screen sends just the ones somebody
  // touched, so changing SGB never freezes FINCOM's default (which follows
  // the FINCOM distribution list) into a fixed copy of today's tags.
  const known = new Set((await tagChoices()).map((t) => t.id));
  const input = (body ?? {}) as Record<string, { mode?: unknown; tagIds?: unknown }>;
  const saved: MinutesAccessSettings = { ...(await getMinutesAccessSettings()) };
  const changed: Record<string, string> = {};
  for (const b of ACCESS_BODIES) {
    const v = input[b];
    if (!v) continue;
    if (v.mode === "default") {
      delete saved[b];
      changed[b] = "default";
      continue;
    }
    if (v.mode !== "everyone" && v.mode !== "tags") continue;
    const tagIds = Array.isArray(v.tagIds)
      ? [...new Set(v.tagIds.map(String))].filter((t) => known.has(t))
      : [];
    saved[b] = { mode: v.mode, tagIds: v.mode === "tags" ? tagIds : [] };
    changed[b] = v.mode === "everyone" ? "everyone" : `${tagIds.length} tag(s)`;
  }

  await saveMinutesAccessSettings(saved);

  await recordActivity({
    ...actorFrom(req, session),
    action: "minutes.access.updated",
    entity: "minutes",
    summary: "Changed who can read minutes",
    detail: changed,
  });

  return NextResponse.json({ success: true });
}
