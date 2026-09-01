import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import {
  getComplianceCheckById,
  downloadComplianceCheckFile,
  attachCheckToPolicy,
} from "@/lib/complianceCheckData";
import {
  createPolicy,
  savePolicyVersions,
  uploadPolicyFile,
  updatePolicy,
} from "@/lib/policyData";
import { REQUIRED_POLICY_CATEGORY } from "@/lib/policyCategories";
import { v4 as uuidv4 } from "uuid";

// Adds a document that was checked on its own into the Policies register.
//
// A document checked from the Compliance Check page used to be a dead end: the
// file and its result were stored, but there was no way to make it a policy, so
// anyone who wanted it in the register had to upload the same file a second
// time and pay for a second check. This takes the file already in storage,
// creates the policy from it, and moves the existing check onto it, so the
// score it already has arrives with it.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "upload_policies");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const check = await getComplianceCheckById(id);
  if (!check) {
    return NextResponse.json({ error: "Check not found" }, { status: 404 });
  }
  if (check.policyId) {
    return NextResponse.json(
      { error: "This document is already in the Policies register." },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim()
    ? body.name.trim()
    : check.name;
  const category =
    typeof body.category === "string" && body.category.trim()
      ? body.category.trim()
      : REQUIRED_POLICY_CATEGORY;
  const description =
    typeof body.description === "string" ? body.description.trim() : "";

  const file = await downloadComplianceCheckFile(id, check.filename);
  if (!file) {
    return NextResponse.json(
      {
        error:
          "The document behind this check is no longer in storage, so it cannot be added to the register.",
      },
      { status: 404 }
    );
  }

  const policyId = uuidv4();
  const now = new Date().toISOString();

  await uploadPolicyFile(policyId, 1, check.ext, file);
  await savePolicyVersions(policyId, [
    {
      version: 1,
      filename: check.filename,
      ext: check.ext,
      uploadedBy: session.id,
      uploadedAt: now,
      size: file.length,
    },
  ]);

  await createPolicy({
    id: policyId,
    name,
    description,
    category,
    currentVersion: 1,
    createdBy: session.id,
    createdAt: now,
    updatedAt: now,
    // The check it already carries is what the register should show, so the
    // policy arrives scored rather than reading "Not checked" next to a result
    // that plainly exists.
    lastCheckScore: check.score,
    lastCheckDate: check.checkedAt,
  });

  const attached = await attachCheckToPolicy(id, policyId, 1, name);
  if (!attached) {
    // The policy is real and scored, so this is not worth unwinding, but the
    // check stays listed as loose and could be promoted a second time.
    console.error("Promoted check could not be attached to its policy:", id);
  }

  // The copy of the file stored with the check is left where it is. It is
  // reachable only through the check, which now reads the policy's copy, and
  // deleting it would leave the check with nothing behind it if the policy is
  // later removed.
  return NextResponse.json(
    { policyId, name, category, check: attached ?? check },
    { headers: { "Cache-Control": "no-store" } }
  );
}
