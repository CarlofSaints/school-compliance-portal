import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import {
  getRecipientSettings,
  saveRecipientSettingsFor,
  resolveStage,
  loadDirectory,
  tagChoices,
} from "@/lib/minutesRecipients";
import { MINUTES_STAGES, stageTags, type MinutesStage, type StageTags } from "@/lib/minutes";
import { getMeetingTypes } from "@/lib/meetingTypesData";
import { meetingTypeLabel } from "@/lib/meetingTypes";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

const CAN_MANAGE = ["manage_minutes", "manage_users"];

const names = (r: Awaited<ReturnType<typeof resolveStage>>) => ({
  to: r.to.map((x) => x.name),
  cc: r.cc.map((x) => x.name),
  withoutEmail: r.withoutEmail,
});

/**
 * Who receives minutes, PER MEETING TYPE and stage, with the actual names each
 * list reaches, so an admin sees people rather than trusting a tag.
 *
 * ?body=<type>&stage=<stage> answers one list only (the Send buttons on a set
 * of minutes show who they are about to reach).
 */
export async function GET(req: NextRequest) {
  const session = await requireAnyPermission(req, CAN_MANAGE);
  if (session instanceof NextResponse) return session;

  const settings = await getRecipientSettings();
  const body = req.nextUrl.searchParams.get("body");
  const stage = req.nextUrl.searchParams.get("stage") as MinutesStage | null;
  if (body && stage && MINUTES_STAGES.some((s) => s.key === stage)) {
    return NextResponse.json({ preview: names(await resolveStage(stage, body, settings)) });
  }

  const [types, tags, dir] = await Promise.all([getMeetingTypes(), tagChoices(), loadDirectory()]);
  const byType: Record<string, Record<string, StageTags & { own: boolean; to_names: string[]; cc_names: string[]; withoutEmail: string[] }>> = {};
  for (const t of types) {
    byType[t.id] = {};
    for (const s of MINUTES_STAGES) {
      const r = await resolveStage(s.key, t.id, settings, dir);
      byType[t.id][s.key] = { ...stageTags(settings, t.id, s.key), to_names: r.to.map((x) => x.name), cc_names: r.cc.map((x) => x.name), withoutEmail: r.withoutEmail };
    }
  }
  return NextResponse.json({ types, tags, byType }, { headers: { "Cache-Control": "no-store" } });
}

/** { body: <type id>, stages: { draft: {to, cc}, signing: {to}, final: {to, cc} } }
 *  Saves ONE meeting type. Only known types, stages and tags are kept. */
export async function PUT(req: NextRequest) {
  const session = await requireAnyPermission(req, CAN_MANAGE);
  if (session instanceof NextResponse) return session;

  const input = await req.json().catch(() => null);
  const types = await getMeetingTypes();
  const type = types.find((t) => t.id === input?.body);
  if (!type) return NextResponse.json({ error: "Choose a meeting type." }, { status: 400 });

  const known = new Set((await tagChoices()).map((t) => t.id));
  const tag = (v: unknown) => (typeof v === "string" && known.has(v) ? v : undefined);
  const stages: Partial<Record<MinutesStage, StageTags>> = {};
  for (const s of MINUTES_STAGES) {
    const v = input?.stages?.[s.key];
    if (!v) continue;
    stages[s.key] = { to: tag(v.to), ...(s.hasCc ? { cc: tag(v.cc) } : {}) };
  }

  await saveRecipientSettingsFor(type.id, stages);
  await recordActivity({
    ...actorFrom(req, session),
    action: "minutes.recipients.updated",
    entity: "minutes",
    summary: `Changed who receives ${meetingTypeLabel(types, type.id)} minutes`,
    detail: { meetingType: type.id, stages: Object.keys(stages) },
  });
  return NextResponse.json({ ok: true });
}
