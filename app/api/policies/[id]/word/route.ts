import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import {
  getPolicyById,
  getPolicyVersions,
  downloadPolicyFile,
  updatePolicy,
  reservePolicyVersion,
  releasePolicyVersion,
  uploadPolicyFile,
} from "@/lib/policyData";
import { transcribePdf, transcriptToDocx, TranscribeError } from "@/lib/policyToWord";
import { contentDisposition } from "@/lib/contentDisposition";

// A long scanned policy takes minutes to read and write out.
export const maxDuration = 800;

// Converts the CURRENT version of a PDF policy (usually a scan of a paper
// copy) into Word and saves it as the next version, so later checks, edits and
// translations work on the Word copy. The scan stays in the version history.
// Answers with the Word file itself, so the person gets it at once instead of
// a second request that storage may not be able to answer yet.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "upload_policies");
  if (session instanceof NextResponse) return session;
  const deadline = Date.now() + 760_000;

  const { id } = await params;
  const policy = await getPolicyById(id);
  if (!policy) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

  const versions = await getPolicyVersions(id);
  const current = versions.find((v) => v.version === policy.currentVersion) || versions[versions.length - 1];
  if (!current || current.ext.toLowerCase() !== "pdf") {
    return NextResponse.json({ error: "Only a PDF policy can be converted to Word." }, { status: 400 });
  }
  const pdf = await downloadPolicyFile(id, current.version, current.ext);
  if (!pdf) return NextResponse.json({ error: "The file for this policy is missing from storage" }, { status: 404 });

  try {
    const docx = await transcriptToDocx(await transcribePdf(pdf, policy.name, deadline));
    const filename = `${current.filename.replace(/\.pdf$/i, "")}.docx`;
    const version = await reservePolicyVersion(id, policy.currentVersion || 0, {
      filename,
      ext: "docx",
      uploadedBy: session.id,
      uploadedAt: new Date().toISOString(),
      size: docx.length,
    });
    try {
      await uploadPolicyFile(id, version, "docx", docx);
    } catch (err) {
      await releasePolicyVersion(id, version).catch(() => {});
      throw err;
    }
    await updatePolicy(id, (p) => ({ currentVersion: Math.max(p.currentVersion || 0, version) }));

    return new NextResponse(new Uint8Array(docx), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": contentDisposition(filename),
        "X-Policy-Version": String(version),
      },
    });
  } catch (err) {
    if (err instanceof TranscribeError) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error("[policy word] Failed:", err);
    const timedOut = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError" || /abort/i.test(err.message));
    return NextResponse.json(
      { error: timedOut ? "This document took too long to convert. Split it into parts and try again." : "The conversion failed. Please try again." },
      { status: timedOut ? 504 : 500 }
    );
  }
}
