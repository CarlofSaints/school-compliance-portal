import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requirePermission } from "@/lib/rolesData";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { resolveBranding } from "@/lib/brandingData";
import { schoolCrest } from "@/lib/minutesDocxFile";
import { createPolicy, savePolicyVersions, uploadPolicyFile } from "@/lib/policyData";
import { REQUIRED_POLICY_CATEGORY } from "@/lib/policyCategories";
import { runComplianceCheck } from "@/lib/complianceEngine";
import { POLICY_AI_CREDITS } from "@/lib/creditPack";
import { getCredits, maySpendCredits, withCredits } from "@/lib/contentTranslation";
import {
  CompileError,
  MAX_DRAFT,
  MAX_CHANGE,
  MAX_DESCRIPTION,
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
// What the page shows before anything is clicked: the balance and whether this person may spend (prices are in lib/creditPack.ts).
export async function GET(req: NextRequest) {
  const session = await requirePermission(req, "upload_policies");
  if (session instanceof NextResponse) return session;
  const [balance, canSpend] = await Promise.all([getCredits(), maySpendCredits(session.id)]);
  return NextResponse.json({ balance, canSpend });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action;
  const session = await requirePermission(req, action === "check" ? "check_compliance" : "upload_policies");
  if (session instanceof NextResponse) return session;

  const name = str(body.name, MAX_NAME);
  const draft = typeof body.draft === "string" ? body.draft.trim() : "";
  if (action !== "draft" && (!name || !draft)) return NextResponse.json({ error: "There is no draft to work on." }, { status: 400 });
  if (draft.length > MAX_DRAFT) return NextResponse.json({ error: "The draft is too long." }, { status: 400 });

  if (!["draft", "revise", "check", "save"].includes(action as string)) return NextResponse.json({ error: "Unknown step." }, { status: 400 });

  // Everything checked before any paid AI call, so a refused request costs nothing.
  const request = action === "draft" || action === "revise" ? cleanCompileRequest(body) : null;
  if (typeof request === "string") return NextResponse.json({ error: request }, { status: 400 });
  const change = typeof body.change === "string" ? body.change.trim() : "";
  if (action === "revise" && !change) return NextResponse.json({ error: "Say what to change." }, { status: 400 });
  if (change.length > MAX_CHANGE) return NextResponse.json({ error: "That change is too long. Ask for it in smaller parts." }, { status: 400 });
  const deadline = Date.now() + 280_000;

  // Paid in the school's credits (Admin > Translation Credits), taken before the AI call and given back if it fails.
  const cost = action === "save" ? 0 : POLICY_AI_CREDITS[action as keyof typeof POLICY_AI_CREDITS];

  try {
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
        description: str(body.description, MAX_DESCRIPTION),
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

    // Who may spend is checked before the rate limits, so a refused person never uses up the school's daily allowance.
    if (!(await maySpendCredits(session.id))) {
      return NextResponse.json(
        { error: "You are not allowed to spend the school's credits. Ask your administrator to tick \"Can spend translation credits\" on your user.", canSpend: false },
        { status: 403 }
      );
    }
    // Paid AI calls: the compliance check keeps its own limits; drafting has its own per-person limit and shares the school's daily one.
    const limited = await enforce([
      [action === "check" ? LIMITS.aiUser : LIMITS.policyAiUser, session.id],
      [LIMITS.aiSchool, "school"],
    ]);
    if (limited) return limited;

    const notEnough = (balance: number | null) =>
      NextResponse.json({ error: "Your school does not have enough credits for this. Buy more under Admin > Translation Credits.", balance }, { status: 402 });

    if (action === "check") {
      // The engine reports a failed run as score 0 with no risks rather than throwing: given back.
      const paid = await withCredits(cost, () => runComplianceCheck(draft, name, "policy", deadline), (r) => r.score === 0 && r.risks.length === 0);
      if (!paid.ok) return notEnough(paid.balance);
      return NextResponse.json({ ...paid.result, balance: paid.balance }, { headers: { "Cache-Control": "no-store" } });
    }
    const paid = await withCredits(cost, () =>
      action === "revise" ? revisePolicy(request!, draft, change, deadline) : resolveBranding().then((school) => compilePolicy(request!, school, deadline))
    );
    if (!paid.ok) return notEnough(paid.balance);
    return NextResponse.json({ draft: paid.result, balance: paid.balance });
  } catch (err) {
    if (err instanceof CompileError) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error(`[policy compile] ${String(action)} failed:`, err);
    const timedOut = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError" || /abort/i.test(err.message));
    return NextResponse.json(
      { error: timedOut ? "This took too long. Please try again, or ask for a shorter policy." : "Something went wrong. Please try again." },
      { status: timedOut ? 504 : 500 }
    );
  }
}
