import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { runComplianceCheck } from "@/lib/complianceEngine";
import { extractTextFromBuffer } from "@/lib/pdfParser";

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
    const text = await extractTextFromBuffer(buffer, ext);

    const result = await runComplianceCheck(
      text,
      name || file.name,
      "policy"
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error("Compliance check failed:", err);
    return NextResponse.json(
      { error: "Compliance check failed" },
      { status: 500 }
    );
  }
}
