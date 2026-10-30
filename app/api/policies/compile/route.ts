import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requirePermission } from "@/lib/rolesData";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { resolveBranding } from "@/lib/brandingData";
import { schoolCrest } from "@/lib/minutesDocxFile";
import { createPolicy, savePolicyVersions, uploadPolicyFile } from "@/lib/policyData";
import { REQUIRED_POLICY_CATEGORY } from "@/lib/policyCategories";
import { runComplianceCheck } from "@/lib/complianceEngine";
import {
  CompileError,
  MAX_DRAFT,
  MAX_INSTRUCTION,
  MAX_NAME,
  cleanCompileRequest,
  compilePolicy,
  policyDocx,
  policyFilename,
  revisePolicy,
} from "@/lib/policyCompile";

// Writing a whole policy takes a minute or two; a revision as long again.
export const maxDuration = 300;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// One route for the four steps of "Compile a policy from scratch":
//   draft  - write it from the form
//   revise - the whole draft again with a change made
//   check  - the usual compliance check on the draft (not saved: it is a draft)
//   save   - the draft as Word on the letterhead, added to the register
// The draft itself lives in the browser until it is saved.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action;
  const session = await requirePermission(req, action === "check" ? "check_compliance" : "upload_policies");
  if (session instanceof NextResponse) return session;

  const name = str(body.name, MAX_NAME);
  const draft = typeof body.draft === "string" ? body.draft.trim() : "";
  if (action !== "draft" && (!name || !draft)) return NextResponse.json({ error: "There is no draft to work on." }, { status: 400 });
  if (draft.length > MAX_DRAFT) return NextResponse.json({ error: "The draft is too long." }, { status: 400 });

  if (action === "save") {
    const school = await resolveBranding();
    const docx = await policyDocx(name, draft, school, await schoolCrest(school));
    const policyId = uuidv4();
    const now = new Date().toISOString();
    const filename = policyFilename(name);
    await uploadPolicyFile(policyId, 1, "docx", docx);
    await savePolicyVersions(policyId, [{ version: 1, filename, ext: "docx", uploadedBy: session.id, uploadedAt: now, size: docx.length }]);
    await createPolicy({
      id: policyId,
      name,
      description: str(body.description, 1000),
      category: str(body.category, 100) || REQUIRED_POLICY_CATEGORY,
      currentVersion: 1,
      createdBy: session.id,
      createdAt: now,
      updatedAt: now,
      lastCheckScore: null,
      lastCheckDate: null,
    });
    return NextResponse.json({ id: policyId }, { status: 201 });
  }

  if (!["draft", "revise", "check"].includes(action as string)) return NextResponse.json({ error: "Unknown step." }, { status: 400 });
  // Paid AI calls: the same per-person and per-school limits as the compliance check.
  const limited = await enforce([
    [LIMITS.aiUser, session.id],
    [LIMITS.aiSchool, "school"],
  ]);
  if (limited) return limited;
  const deadline = Date.now() + 280_000;

  try {
    if (action === "check") {
      return NextResponse.json(await runComplianceCheck(draft, name, "policy"), { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "revise") {
      const change = str(body.change, MAX_INSTRUCTION);
      if (!change) return NextResponse.json({ error: "Say what to change." }, { status: 400 });
      return NextResponse.json({ draft: await revisePolicy(name, draft, change, deadline) });
    }
    const request = cleanCompileRequest(body);
    if (typeof request === "string") return NextResponse.json({ error: request }, { status: 400 });
    return NextResponse.json({ draft: await compilePolicy(request, await resolveBranding(), deadline) });
  } catch (err) {
    if (err instanceof CompileError) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error("[policy compile] Failed:", err);
    const timedOut = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError" || /abort/i.test(err.message));
    return NextResponse.json(
      { error: timedOut ? "This took too long. Please try again, or ask for a shorter policy." : "Something went wrong. Please try again." },
      { status: timedOut ? 504 : 500 }
    );
  }
}
