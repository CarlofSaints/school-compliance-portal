import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import {
  getPolicyById,
  updatePolicy,
  reservePolicyVersion,
  releasePolicyVersion,
  uploadPolicyFile,
} from "@/lib/policyData";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "upload_policies");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const policy = await getPolicyById(id);
  if (!policy) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json(
        { error: "File is required" },
        { status: 400 }
      );
    }

    const ext = file.name.split(".").pop() || "pdf";
    const buffer = Buffer.from(await file.arrayBuffer());
    // The number is reserved under a guarded write, so two uploads at once
    // each get their own instead of overwriting one file.
    const newVersion = await reservePolicyVersion(id, policy.currentVersion || 0, {
      filename: file.name,
      ext,
      uploadedBy: session.id,
      uploadedAt: new Date().toISOString(),
      size: buffer.length,
    });
    try {
      await uploadPolicyFile(id, newVersion, ext, buffer);
    } catch (err) {
      await releasePolicyVersion(id, newVersion).catch(() => {});
      throw err;
    }
    // Never moves backwards: if a later version landed first, it stays current.
    await updatePolicy(id, (current) => ({
      currentVersion: Math.max(current.currentVersion || 0, newVersion),
    }));

    return NextResponse.json({ version: newVersion }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
