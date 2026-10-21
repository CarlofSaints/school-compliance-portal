import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { getSpendById, updateSpendApplication, SpendChangeRefused } from "@/lib/spendData";
import { mayActOnApproved } from "@/lib/approvalEngine";
import { getApprovalSettings, quoteBandProblem, type QuoteBandProblem } from "@/lib/approvalSettings";

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

    // 🔴 Every check again INSIDE the guarded write, on the row as it is NOW:
    // two selections at once (two approvers, a double click) cannot both
    // land, and the band is judged against the amount actually approved.
    const { tiers } = await getApprovalSettings();
    let band: QuoteBandProblem | null = null;
    let approvedAmount = 0;
    try {
      await updateSpendApplication(id, (current) => {
        band = null;
        if (current.status !== "approved") throw new SpendChangeRefused("Can only select a quote for approved applications", 400);
        if (current.selectedQuoteIndex !== undefined) throw new SpendChangeRefused("A quote has already been selected", 400);
        const quote = current.quoteDetails[quoteIndex];
        if (!quote) throw new SpendChangeRefused("Invalid quote index", 400);
        approvedAmount = quote.priceExclVat || 0;
        // A quote above what was approved may not carry the application into
        // a band whose approvers never saw it.
        band = quoteBandProblem(tiers, approvedAmount, current.approvedAmount ?? current.estimatedAmount, current.approvalTierId);
        if (band) throw new SpendChangeRefused("band", 409);
        return { selectedQuoteIndex: quoteIndex, approvedAmount };
      });
    } catch (err) {
      if (!(err instanceof SpendChangeRefused)) throw err;
      if (band) {
        // The spend page says this in the reader's language from code, limit
        // and quote; `error` is only a short fallback for anything else.
        return NextResponse.json(
          { error: "This quote is outside the approval band this request was approved in.", ...(band as QuoteBandProblem), quote: approvedAmount },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    return NextResponse.json({ success: true, approvedAmount });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
