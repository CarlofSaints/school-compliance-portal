import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import {
  getPolicyById,
  getPolicyVersions,
  downloadPolicyFile,
} from "@/lib/policyData";
import {
  contentDisposition,
  DOWNLOAD_CONTENT_TYPES,
} from "@/lib/contentDisposition";

// Serves the file behind a policy. Callers fetch it and save the blob (see
// lib/download.ts) rather than linking to it, so a failure shows as a message
// on the page instead of the browser's "file wasn't available on site".
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "download_policies");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const policy = await getPolicyById(id);
  if (!policy) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  const versions = await getPolicyVersions(id);
  const requested = Number(req.nextUrl.searchParams.get("version"));
  const wanted = Number.isFinite(requested) && requested > 0
    ? requested
    : policy.currentVersion;

  const version =
    versions.find((v) => v.version === wanted) ||
    versions[versions.length - 1];

  if (!version) {
    return NextResponse.json(
      { error: "This policy has no uploaded file" },
      { status: 404 }
    );
  }

  const file = await downloadPolicyFile(id, version.version, version.ext);
  if (!file) {
    return NextResponse.json(
      { error: "The file for this policy is missing from storage" },
      { status: 404 }
    );
  }

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type":
        DOWNLOAD_CONTENT_TYPES[version.ext.toLowerCase()] || "application/octet-stream",
      "Content-Disposition": contentDisposition(version.filename),
    },
  });
}
