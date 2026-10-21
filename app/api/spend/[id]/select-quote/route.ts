import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { getSpendById, updateSpendApplication } from "@/lib/spendData";
import { mayActOnApproved } from "@/lib/approvalEngine";
import { getApprovalSettings, quoteBandProblem } from "@/lib/approvalSettings";
import { formatRand } from "@/lib/spendReport";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "approve_spend");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const app = await getSpendById(id);
  if (!app) {
    return NextResponse.json(
      { error: "Spend application not found" },
      { status: 404 }
    );
  }

  // The permission alone is not enough: only this application's approvers or
  // a spend admin, and never the person whose application it is.
  if (!mayActOnApproved(app, session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (app.status !== "approved") {
    return NextResponse.json(
      { error: "Can only select a quote for approved applications" },
      { status: 400 }
    );
  }

  if (app.selectedQuoteIndex !== undefined) {
    return NextResponse.json(
      { error: "A quote has already been selected" },
      { status: 400 }
    );
  }

  try {
    const body = await req.json();
    const { quoteIndex } = body;

    if (
      !Number.isInteger(quoteIndex) ||
      quoteIndex < 0 ||
      quoteIndex >= app.quoteDetails.length
    ) {
      return NextResponse.json(
        { error: "Invalid quote index" },
        { status: 400 }
      );
    }

    const selectedQuote = app.quoteDetails[quoteIndex];
    const approvedAmount = selectedQuote.priceExclVat || 0;
    // A quote above what was approved may not carry the application into a
    // band whose approvers never saw it.
    const { tiers } = await getApprovalSettings();
    const problem = quoteBandProblem(tiers, approvedAmount, app.approvedAmount ?? app.estimatedAmount, app.approvalTierId);
    if (problem) {
      // The English line for anything that does not read `code`; the spend
      // page builds the same sentence in the reader's language from the code.
      const quote = formatRand(approvedAmount);
      const error =
        problem.code === "no_amount"
          ? "This application has no approved or estimated amount, so a quote cannot be checked against its approval band. Edit the application to add the amount first."
          : problem.limit === null
            ? `This quote (${quote}) is above the approval band this request was approved in. It needs a new approval at the higher band.`
            : `This quote (${quote}) is above the approval limit of the band this request was approved in (${formatRand(problem.limit)}). It needs a new approval at the higher band.`;
      return NextResponse.json({ error, ...problem, quote: approvedAmount }, { status: 409 });
    }

    await updateSpendApplication(id, {
      selectedQuoteIndex: quoteIndex,
      approvedAmount,
    });

    return NextResponse.json({ success: true, approvedAmount });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
