import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platformAdmin";
import { getTenantByKey } from "@/lib/tenantRegistry";
import { runAsTenant } from "@/lib/tenantContext";
import { recordActivity } from "@/lib/activityLog";
import { getAddon, saveAddon, getUsage } from "@/lib/contentTranslation";

// The document-translation add-on (R100/month), switched per school by Carl.
// Not a school setting: a school must not be able to switch on what it has
// not paid for, so only the platform admin reaches this.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;
  const { key } = await params;
  if (!(await getTenantByKey(key))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(
    await runAsTenant(key, async () => ({ ...(await getAddon()), used: await getUsage() }))
  );
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;
  const { key } = await params;
  if (!(await getTenantByKey(key))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { enabled?: unknown; monthlyCap?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // Refused below.
  }
  const cap = Number(body.monthlyCap);
  if (typeof body.enabled !== "boolean" || !Number.isInteger(cap) || cap < 0 || cap > 200) {
    return NextResponse.json({ error: "enabled (true/false) and monthlyCap (0-200) are required" }, { status: 400 });
  }

  const saved = await runAsTenant(key, async () => {
    const addon = { enabled: body.enabled as boolean, monthlyCap: cap, changedAt: new Date().toISOString(), changedBy: admin.email };
    await saveAddon(addon);
    await recordActivity({
      actorName: `${admin.email} (School Compliance support)`,
      actorEmail: admin.email,
      action: "translation_addon.changed",
      entity: "system",
      summary: `Document translation add-on ${addon.enabled ? `switched ON (${cap} a month)` : "switched OFF"}`,
      detail: { enabled: addon.enabled, monthlyCap: cap },
    });
    return { ...addon, used: await getUsage() };
  });
  return NextResponse.json(saved);
}
