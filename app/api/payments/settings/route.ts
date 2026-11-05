import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { getTags } from "@/lib/tagData";
import { getPaymentSettings, savePaymentSettings } from "@/lib/paymentData";

// Which tags may sign invoices. Same authority as the spend approval bands.
export async function GET(req: NextRequest) {
  const session = await requirePermission(req, "manage_approval_settings");
  if (session instanceof NextResponse) return session;
  const [settings, tags] = await Promise.all([getPaymentSettings(), getTags()]);
  return NextResponse.json({ ...settings, tags: tags.map((t) => ({ id: t.id, name: t.name })) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: NextRequest) {
  const session = await requirePermission(req, "manage_approval_settings");
  if (session instanceof NextResponse) return session;
  const body = (await req.json().catch(() => null)) as { signerTagIds?: unknown } | null;
  const known = new Set((await getTags()).map((t) => t.id));
  const ids = Array.isArray(body?.signerTagIds) ? body.signerTagIds.filter((x): x is string => typeof x === "string" && known.has(x)) : [];
  await savePaymentSettings([...new Set(ids)]);
  await recordActivity({
    ...actorFrom(req, session),
    action: "payment.signers_changed",
    entity: "payment",
    summary: "Changed which tags may sign invoices",
    detail: { signerTagIds: ids },
  });
  return NextResponse.json({ signerTagIds: ids });
}
