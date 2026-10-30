import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { createShareLink, getGuests, getShareLinks, type ShareKind } from "@/lib/campusShare";
import { getMaterials, getModules, getTests } from "@/lib/trainingData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

export const dynamic = "force-dynamic";

async function titles() {
  const [modules, materials, tests] = await Promise.all([getModules(), getMaterials(), getTests()]);
  const all = [...modules.map((m) => ["module", m] as const), ...materials.map((m) => ["material", m] as const), ...tests.map((t) => ["test", t] as const)];
  return new Map(all.map(([k, x]) => [`${k}:${x.id}`, { title: x.title, status: x.status }]));
}

export async function GET(req: NextRequest) {
  const session = await requirePermission(req, "manage_training");
  if (session instanceof NextResponse) return session;
  const [links, names] = await Promise.all([getShareLinks(), titles()]);
  const rows = await Promise.all(
    links.map(async (l) => ({
      ...l,
      target: names.get(`${l.kind}:${l.targetId}`) ?? { title: "(deleted)", status: "draft" },
      guests: (await getGuests(l.token)).length,
    }))
  );
  return NextResponse.json(rows.reverse(), { headers: { "Cache-Control": "no-store" } });
}

// { kind, targetId, label, expiresOn }
export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_training");
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => ({}));
  const kind = (["module", "material", "test"] as ShareKind[]).includes(body.kind) ? (body.kind as ShareKind) : null;
  const target = kind && typeof body.targetId === "string" ? (await titles()).get(`${kind}:${body.targetId}`) : undefined;
  if (!kind || !target) return NextResponse.json({ error: "Choose what the link opens." }, { status: 400 });
  if (target.status !== "published") return NextResponse.json({ error: "Publish it first: a link only opens published training." }, { status: 400 });
  const expiresOn = typeof body.expiresOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.expiresOn) ? body.expiresOn : "";
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 120) : "";
  const link = await createShareLink(kind, body.targetId, label, expiresOn, session.id);
  await recordActivity({
    ...actorFrom(req, session),
    action: "training.share.created",
    entity: "training",
    entityId: link.targetId,
    summary: `Made a share link for "${target.title}"${label ? ` (${label})` : ""}${expiresOn ? `, works until ${expiresOn}` : ""}`,
  });
  return NextResponse.json(link, { status: 201 });
}
