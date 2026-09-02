import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { requirePermission } from "@/lib/rolesData";
import {
  getPolicyById,
  downloadPolicyFile,
  updatePolicy,
  getPolicyVersions,
} from "@/lib/policyData";
import {
  addComplianceCheck,
  deleteComplianceCheck,
  getComplianceChecksForPolicy,
} from "@/lib/complianceCheckData";
import { runComplianceCheckOnFile } from "@/lib/complianceEngine";
import { v4 as uuidv4 } from "uuid";

// Web search + large PDF extraction + Claude API can take time
export const maxDuration = 120;

// The score on the policy is a copy of its most recent check, so after a check
// is added or removed it has to be brought back into step with what is now in
// the store. Recomputed rather than assumed: removing a re-check should fall
// back to the check before it, not to "Not checked".
async function refreshPolicyScore(policyId: string) {
  const remaining = await getComplianceChecksForPolicy(policyId);
  // getComplianceChecks sorts newest first, so the head is the check the policy
  // should now be showing.
  const latest = remaining[0];
  return updatePolicy(policyId, {
    lastCheckScore: latest ? latest.score : null,
    lastCheckDate: latest ? latest.checkedAt : null,
  });
}

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

  const removed = await deleteComplianceCheck(checkId);
  if (!removed) {
    return NextResponse.json({ error: "Check not found" }, { status: 404 });
  }

  const updated = await refreshPolicyScore(id);

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

    const fileBuffer = await downloadPolicyFile(id, latest.version, latest.ext);
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

    const checkedByName =
      `${session.name || ""} ${session.surname || ""}`.trim() ||
      session.name ||
      session.email;

    const check = {
      id: uuidv4(),
      name: policy.name,
      filename: latest.filename,
      ext: latest.ext,
      // The bytes are right here, so record what was actually checked. This
      // used to be left off, which meant a policy check could never be
      // recognised as the same document as anything else - the two DATA
      // MANAGEMENT POLICY MASTER checks are the same policy, same version,
      // and scored 62 then 68 with nothing to tie them together.
      hash: createHash("sha256").update(fileBuffer).digest("hex"),
      policyId: id,
      policyVersion: latest.version,
      score: result.score,
      summary: result.summary,
      risks: result.risks,
      sources: result.sources,
      issueCount: result.risks.length,
      checkedBy: session.id,
      checkedByName,
      checkedAt: new Date().toISOString(),
    };

    // No file bytes: this document is already in storage under the policy, and
    // a second copy here would be the same drift this merge is undoing.
    await addComplianceCheck(check, null);
    await updatePolicy(id, {
      lastCheckScore: result.score,
      lastCheckDate: check.checkedAt,
    });

    return NextResponse.json(check, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("Compliance check failed:", err);
    return NextResponse.json(
      { error: "Compliance check failed. Check API key configuration." },
      { status: 500 }
    );
  }
}
