import { NextRequest, NextResponse } from "next/server";
import { actorFrom } from "@/lib/activityActor";
import { requirePermission } from "@/lib/rolesData";
import { getSpendById, updateSpendApplication } from "@/lib/spendData";
import { mayActOnApproved } from "@/lib/approvalEngine";

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
      { error: "Can only complete approved projects" },
      { status: 400 }
    );
  }

  try {
    const body = await req.json();
    const {
      finishedOnTime,
      finishedWithinBudget,
      budgetOverrunAmount,
      budgetOverrunExplanation,
    } = body;

    await updateSpendApplication(id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      completedBy: `${session.name} ${session.surname}`,
      finishedOnTime: !!finishedOnTime,
      finishedWithinBudget: !!finishedWithinBudget,
      budgetOverrunAmount: finishedWithinBudget
        ? 0
        : parseFloat(budgetOverrunAmount) || 0,
      budgetOverrunExplanation: finishedWithinBudget
        ? ""
        : budgetOverrunExplanation || "",
    }, { byName: actorFrom(req, session).actorName });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
