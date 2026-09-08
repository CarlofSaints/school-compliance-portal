import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platformAdmin";
import {
  listCodes,
  createCode,
  normaliseCode,
  discountKindProblem,
  CodeExistsError,
  type PlatformCode,
} from "@/lib/platformCodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Carl's discount codes.
 *
 * 🔴 Gated by requirePlatformAdmin, which fails CLOSED and answers 404 rather
 * than 403 — a 403 confirms the route exists. Anyone who could reach this
 * could mint themselves a 100% code, so it gets the same gate as the rest of
 * /platform and deliberately does NOT reuse the portal's own permission grid,
 * which school admins can edit.
 */
export async function GET() {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    return NextResponse.json({ codes: await listCodes() });
  } catch (err) {
    console.error("[platform/codes] list failed:", err);
    return NextResponse.json({ error: "Could not read the codes." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 });
  }

  const code = normaliseCode(String(body.code || ""));
  if (code.length < 4) {
    return NextResponse.json(
      { error: "A code needs at least 4 characters." },
      { status: 400 }
    );
  }

  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const percentOff =
    body.discountKind === "percent"
      ? {
          monthly: Math.min(100, num((body.percentOff as never)?.["monthly"])),
          annual: Math.min(100, num((body.percentOff as never)?.["annual"])),
        }
      : null;
  const amountOff =
    body.discountKind === "amount"
      ? {
          monthly: num((body.amountOff as never)?.["monthly"]),
          annual: num((body.amountOff as never)?.["annual"]),
        }
      : null;

  const kindProblem = discountKindProblem({ percentOff, amountOff });
  if (kindProblem) return NextResponse.json({ error: kindProblem }, { status: 400 });

  // 🔴 Only the two spans a PayFast subscription can actually express:
  // 1 discounts the first payment, null discounts every payment. Anything
  // else would need a scheduled job to raise the amount later, and a job that
  // fails silently leaves a school discounted forever.
  const billingCycles = body.span === "forever" ? null : 1;

  const appliesTo =
    body.appliesTo === "existing_school" ? "existing_school" : "new_school";
  const targetSchoolKey =
    appliesTo === "existing_school" ? String(body.targetSchoolKey || "").trim() : "";
  if (appliesTo === "existing_school" && !targetSchoolKey) {
    return NextResponse.json(
      { error: "Pick the school this code is for." },
      { status: 400 }
    );
  }

  const maxRedemptions =
    body.maxRedemptions === null || body.maxRedemptions === ""
      ? null
      : Math.max(1, Math.floor(Number(body.maxRedemptions) || 1));

  const expiresOn = String(body.expiresOn || "").trim() || null;
  if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) {
    return NextResponse.json({ error: "The expiry date looks wrong." }, { status: 400 });
  }

  const record: Omit<PlatformCode, "code" | "createdAt" | "redemptions"> & {
    code: string;
  } = {
    code,
    kind: body.kind === "referral" ? "referral" : "promo",
    appliesTo,
    percentOff,
    amountOff,
    billingCycles,
    targetSchoolKey: targetSchoolKey || undefined,
    referrerSchoolKey: String(body.referrerSchoolKey || "").trim() || undefined,
    label: String(body.label || "").trim() || "Discount",
    expiresOn,
    maxRedemptions,
    createdBy: admin.email,
  };

  try {
    return NextResponse.json({ code: await createCode(record) }, { status: 201 });
  } catch (err) {
    if (err instanceof CodeExistsError) {
      // Deliberately the same wording the public checkout uses, so this cannot
      // be used to find out which codes exist.
      return NextResponse.json(
        { error: "That code is not available." },
        { status: 409 }
      );
    }
    console.error("[platform/codes] create failed:", err);
    return NextResponse.json({ error: "Could not create the code." }, { status: 500 });
  }
}
