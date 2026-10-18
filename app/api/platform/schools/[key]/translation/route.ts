import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platformAdmin";
import { getTenantByKey } from "@/lib/tenantRegistry";
import { runAsTenant } from "@/lib/tenantContext";
import { recordActivity } from "@/lib/activityLog";
import { addCredits, getCredits } from "@/lib/contentTranslation";

// A school's document-translation credits, added by Carl when the school has
// paid. Not a school setting: a school must not be able to give itself
// credits it has not bought, so only the platform admin reaches this.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;
  const { key } = await params;
  if (!(await getTenantByKey(key))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ balance: await runAsTenant(key, getCredits) });
}

// { add: n } adds n credits; a negative n corrects a mistake.
export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;
  const { key } = await params;
  if (!(await getTenantByKey(key))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { add?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // Refused below.
  }
  const add = Number(body.add);
  if (!Number.isInteger(add) || add === 0 || Math.abs(add) > 1000) {
    return NextResponse.json({ error: "add must be a whole number of credits, -1000 to 1000, not 0" }, { status: 400 });
  }

  const balance = await runAsTenant(key, async () => {
    const balance = await addCredits(add);
    await recordActivity({
      actorName: `${admin.email} (School Compliance support)`,
      actorEmail: admin.email,
      action: "translation_credits.added",
      entity: "system",
      summary: `${add > 0 ? `${add} translation credits added` : `${-add} translation credits removed`}. Balance ${balance}.`,
      detail: { add, balance },
    });
    return balance;
  });
  return NextResponse.json({ balance });
}
