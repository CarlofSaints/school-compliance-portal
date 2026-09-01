import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { requirePermission } from "@/lib/rolesData";
import { runComplianceCheckOnFile } from "@/lib/complianceEngine";
import {
  addComplianceCheck,
  findComplianceCheckByHash,
} from "@/lib/complianceCheckData";
import { v4 as uuidv4 } from "uuid";

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
    const docName = name || file.name;

    // Duplicate detection: if this exact file was already checked, return the
    // saved result instead of re-running the AI (saves cost + clutter).
    const hash = createHash("sha256").update(buffer).digest("hex");
    const existing = await findComplianceCheckByHash(hash);
    if (existing) {
      return NextResponse.json({
        score: existing.score,
        summary: existing.summary,
        risks: existing.risks,
        sources: existing.sources,
        id: existing.id,
        name: existing.name,
        filename: existing.filename,
        policyId: existing.policyId ?? null,
        duplicate: true,
        checkedAt: existing.checkedAt,
      });
    }

    const result = await runComplianceCheckOnFile(
      buffer,
      ext,
      docName,
      "policy"
    );

    // Persist the check + original file so it appears on the dashboard and can
    // be re-viewed / downloaded later. A persistence failure must not lose the
    // result the user is waiting on, so it's non-fatal.
    let checkId: string | null = null;
    try {
      checkId = uuidv4();
      const checkedByName =
        `${session.name || ""} ${session.surname || ""}`.trim() ||
        session.name ||
        session.email;
      await addComplianceCheck(
        {
          id: checkId,
          name: docName,
          filename: file.name,
          ext,
          hash,
          score: result.score,
          summary: result.summary,
          risks: result.risks,
          sources: result.sources,
          issueCount: result.risks.length,
          checkedBy: session.id,
          checkedByName,
          checkedAt: new Date().toISOString(),
        },
        buffer
      );
    } catch (saveErr) {
      console.error("Failed to save compliance check:", saveErr);
      checkId = null;
    }

    return NextResponse.json(
      { ...result, id: checkId, name: docName, filename: file.name, policyId: null },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Compliance check failed:", message, err);
    return NextResponse.json(
      { error: `Compliance check failed: ${message}` },
      { status: 500 }
    );
  }
}
