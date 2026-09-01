import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import {
  getComplianceCheckById,
  downloadComplianceCheckFile,
} from "@/lib/complianceCheckData";
import { downloadPolicyFile, getPolicyVersions } from "@/lib/policyData";
import {
  contentDisposition,
  DOWNLOAD_CONTENT_TYPES,
} from "@/lib/contentDisposition";

export const dynamic = "force-dynamic";

// Serves the document a check was run against.
//
// Where that document lives depends on whether the check is attached to a
// policy. A loose document was stored with the check itself; a policy's file
// belongs to the policy and is read from there, so the register stays the one
// copy of it.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "check_compliance");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const check = await getComplianceCheckById(id);
  if (!check) {
    return NextResponse.json({ error: "Check not found" }, { status: 404 });
  }

  let buffer: Buffer | null = null;
  let filename = check.filename;
  let ext = check.ext;

  if (check.policyId) {
    const versions = await getPolicyVersions(check.policyId);
    const version =
      versions.find((v) => v.version === check.policyVersion) ||
      versions[versions.length - 1];
    if (version) {
      filename = version.filename;
      ext = version.ext;
      buffer = await downloadPolicyFile(
        check.policyId,
        version.version,
        version.ext
      );
    }
  } else {
    buffer = await downloadComplianceCheckFile(id, check.filename);
  }

  if (!buffer) {
    return NextResponse.json(
      { error: "Document file not found" },
      { status: 404 }
    );
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        DOWNLOAD_CONTENT_TYPES[ext.toLowerCase().replace(".", "")] ||
        "application/octet-stream",
      "Content-Disposition": contentDisposition(filename),
    },
  });
}
