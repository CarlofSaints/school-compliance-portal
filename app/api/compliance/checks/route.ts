import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { getComplianceChecks, countStatuses } from "@/lib/complianceCheckData";
import { getPolicies } from "@/lib/policyData";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await requirePermission(req, "view_dashboard");
  if (session instanceof NextResponse) return session;

  const [checks, policies] = await Promise.all([
    getComplianceChecks(),
    getPolicies(),
  ]);

  // The policy's current name rather than the one stored on the check, so a
  // policy renamed after it was checked reads correctly here. A policyId with
  // no matching policy means the policy was deleted; the check outlives it and
  // is shown as no longer in the register.
  const names = new Map(policies.map((p) => [p.id, p.name]));

  // Lean payload for the dashboard grid (no full risk text) + per-check status
  // breakdown so the dashboard can aggregate issues by status.
  const list = checks.map((c) => ({
    id: c.id,
    name: c.name,
    policyId: c.policyId ?? null,
    policyName: c.policyId ? names.get(c.policyId) ?? null : null,
    score: c.score,
    issueCount: c.issueCount,
    statusCounts: countStatuses(c.risks),
    checkedByName: c.checkedByName,
    checkedAt: c.checkedAt,
  }));

  return NextResponse.json(list, {
    headers: { "Cache-Control": "no-store" },
  });
}
