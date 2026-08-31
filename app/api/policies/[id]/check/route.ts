import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import {
  getPolicyById,
  downloadPolicyFile,
  saveComplianceCheck,
  updatePolicy,
  getPolicyVersions,
  deleteComplianceCheck,
} from "@/lib/policyData";
import { runComplianceCheckOnFile } from "@/lib/complianceEngine";
import { v4 as uuidv4 } from "uuid";

// Web search + large PDF extraction + Claude API can take time
export const maxDuration = 120;

// Removing a check is an administrative act rather than part of running one,
// so it is gated on manage_policies, not on check_compliance: the people who
// run checks are not necessarily the people who may erase the record of one.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "manage_policies");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const checkId = req.nextUrl.searchParams.get("checkId");
  if (!checkId) {
    return NextResponse.json({ error: "checkId is required" }, { status: 400 });
  }

  const policy = await getPolicyById(id);
  if (!policy) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  const { removed, policy: updated } = await deleteComplianceCheck(id, checkId);
  if (!removed) {
    return NextResponse.json({ error: "Check not found" }, { status: 404 });
  }

  // Hand back what was just written rather than reading it in again: an
  // overwrite takes a moment to propagate, and a read-back here would return
  // the score that has only just been removed.
  return NextResponse.json(
    { policy: updated },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "check_compliance");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const policy = await getPolicyById(id);
  if (!policy) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  try {
    const versions = await getPolicyVersions(id);
    const latest = versions[versions.length - 1];
    if (!latest) {
      return NextResponse.json(
        { error: "No policy file found" },
        { status: 400 }
      );
    }

    const fileBuffer = await downloadPolicyFile(
      id,
      latest.version,
      latest.ext
    );
    if (!fileBuffer) {
      return NextResponse.json(
        { error: "Could not read policy file" },
        { status: 500 }
      );
    }

    const result = await runComplianceCheckOnFile(
      fileBuffer,
      latest.ext,
      policy.name,
      "policy"
    );

    const checkId = uuidv4();
    const check = {
      id: checkId,
      policyId: id,
      score: result.score,
      summary: result.summary,
      risks: result.risks,
      checkedBy: session.id,
      checkedAt: new Date().toISOString(),
    };

    await saveComplianceCheck(id, check);
    await updatePolicy(id, {
      lastCheckScore: result.score,
      lastCheckDate: check.checkedAt,
    });

    return NextResponse.json(check);
  } catch (err) {
    console.error("Compliance check failed:", err);
    return NextResponse.json(
      { error: "Compliance check failed. Check API key configuration." },
      { status: 500 }
    );
  }
}
