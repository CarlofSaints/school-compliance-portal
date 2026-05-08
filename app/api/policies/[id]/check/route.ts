import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import {
  getPolicyById,
  downloadPolicyFile,
  saveComplianceCheck,
  updatePolicy,
  getPolicyVersions,
} from "@/lib/policyData";
import { runComplianceCheck } from "@/lib/complianceEngine";
import { extractTextFromBuffer } from "@/lib/pdfParser";
import { v4 as uuidv4 } from "uuid";

// Web search + large PDF extraction + Claude API can take time
export const maxDuration = 120;

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

    const policyText = await extractTextFromBuffer(fileBuffer, latest.ext);
    const result = await runComplianceCheck(policyText, policy.name, "policy");

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
