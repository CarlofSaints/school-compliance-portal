import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { runComplianceCheckOnFile } from "@/lib/complianceEngine";

// Web search + large PDF extraction + Claude API can take time
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "check_compliance");
  if (session instanceof NextResponse) return session;

  try {
    const formData = await req.formData();
    const name = formData.get("name") as string;
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "File is required" },
        { status: 400 }
      );
    }

    const ext = file.name.split(".").pop() || "pdf";
    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await runComplianceCheckOnFile(
      buffer,
      ext,
      name || file.name,
      "policy"
    );

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Compliance check failed:", message, err);
    return NextResponse.json(
      { error: `Compliance check failed: ${message}` },
      { status: 500 }
    );
  }
}
