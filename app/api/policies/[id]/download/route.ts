import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import {
  getPolicyById,
  getPolicyVersions,
  downloadPolicyFile,
} from "@/lib/policyData";

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain; charset=utf-8",
};

// HTTP headers are Latin-1. A filename with an em dash or an accent in it makes
// Content-Disposition throw outright, which would turn a working download into
// a 500. So the plain filename is stripped back to ASCII for old clients and
// the real one is sent as RFC 6266 filename*, which everything current reads.
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(
    filename
  )}`;
}

// Serves the file behind a policy. Note this cannot be reached with a plain
// <a href download>: sessions are carried in an x-user-id header, which a
// browser navigation does not send, so the response would be a 401 that the
// browser reports as "file wasn't available on site". The caller must fetch it
// and save the blob.
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
        CONTENT_TYPES[version.ext.toLowerCase()] || "application/octet-stream",
      "Content-Disposition": contentDisposition(version.filename),
    },
  });
}
