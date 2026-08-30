import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requirePermission } from "@/lib/rolesData";
import {
  getApprovalSettings,
  saveApprovalSettings,
  validateTiers,
  sortTiers,
} from "@/lib/approvalSettings";
import type { ApprovalTier, ApprovalRequirement } from "@/lib/approvalSettings";

// Readable by any signed-in user: the new-application form shows which band an
// amount falls into and who will be asked, so people know before they submit.
export async function GET(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const settings = await getApprovalSettings();
  return NextResponse.json({
    ...settings,
    problems: validateTiers(settings.tiers),
  });
}

export async function PUT(req: NextRequest) {
  const session = await requirePermission(req, "manage_approval_settings");
  if (session instanceof NextResponse) return session;

  try {
    const body = await req.json();
    const rawTiers = Array.isArray(body?.tiers) ? body.tiers : [];

    const tiers: ApprovalTier[] = rawTiers.map(
      (t: Record<string, unknown>, i: number) => {
        const max = t.maxAmount;
        return {
          id: String(t.id || `tier-${i}`),
          label: String(t.label ?? "").trim() || `Band ${i + 1}`,
          minAmount: Math.max(0, Number(t.minAmount) || 0),
          // An empty or non-numeric maximum means "no ceiling".
          maxAmount:
            max === null || max === "" || max === undefined || isNaN(Number(max))
              ? null
              : Number(max),
          logOnly: !!t.logOnly,
          requirements: Array.isArray(t.requirements)
            ? (t.requirements as Record<string, unknown>[])
                .filter((r) => r && typeof r.tagId === "string" && r.tagId)
                .map(
                  (r): ApprovalRequirement => ({
                    tagId: String(r.tagId),
                    mode: r.mode === "any" ? "any" : "all",
                  })
                )
            : [],
        };
      }
    );

    await saveApprovalSettings({
      tiers: sortTiers(tiers),
      notifyApplicantOnEachApproval:
        body?.notifyApplicantOnEachApproval !== false,
    });

    const saved = await getApprovalSettings();
    // Problems are returned rather than refused: a half-configured set of bands
    // is a normal step on the way to a finished one, and the page shows them.
    return NextResponse.json({
      ...saved,
      problems: validateTiers(saved.tiers),
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
