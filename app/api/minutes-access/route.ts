import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { getMinutesAccessSettings, saveMinutesAccessSettings, loadMinutesAccessContext } from "@/lib/minutesAccess";
import { tagChoices } from "@/lib/minutesRecipients";
import { getUsers } from "@/lib/userData";
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

  const [ctx, tags, users] = await Promise.all([loadMinutesAccessContext(), tagChoices(), getUsers()]);

  const holders = (tagIds: string[]) => {
    const names = new Set<string>();
    for (const u of users) {
      if (u.tagIds?.some((t) => tagIds.includes(t))) names.add(`${u.name} ${u.surname}`.trim());
    }
    for (const p of ctx.people) {
      if (p.tagIds?.some((t) => tagIds.includes(t))) names.add(p.name);
    }
    return [...names].filter(Boolean).sort();
  };

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

  // Only known bodies, only the two modes, only tags that exist. Anything else
  // is dropped rather than stored, so a bad save cannot widen access by
  // writing a mode the rule does not understand.
  const known = new Set((await tagChoices()).map((t) => t.id));
  const input = (body ?? {}) as Record<string, { mode?: unknown; tagIds?: unknown }>;
  const next: MinutesAccessSettings = {};
  for (const b of ACCESS_BODIES) {
    const v = input[b];
    if (!v || (v.mode !== "everyone" && v.mode !== "tags")) continue;
    const tagIds = Array.isArray(v.tagIds)
      ? [...new Set(v.tagIds.map(String))].filter((t) => known.has(t))
      : [];
    next[b] = { mode: v.mode, tagIds: v.mode === "tags" ? tagIds : [] };
  }

  await saveMinutesAccessSettings({ ...(await getMinutesAccessSettings()), ...next });

  await recordActivity({
    ...actorFrom(req, session),
    action: "minutes.access.updated",
    entity: "minutes",
    summary: "Changed who can read minutes",
    detail: Object.fromEntries(
      Object.entries(next).map(([b, v]) => [b, v.mode === "everyone" ? "everyone" : `${v.tagIds.length} tag(s)`])
    ),
  });

  return NextResponse.json({ success: true });
}
