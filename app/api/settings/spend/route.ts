import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requirePermission } from "@/lib/rolesData";
import { getSpendSettings, saveSpendSettings } from "@/lib/settingsData";

export async function GET(req: NextRequest) {
  // Any logged-in user can read settings (for form dropdowns)
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const settings = await getSpendSettings();
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  const session = await requirePermission(req, "manage_spend_settings");
  if (session instanceof NextResponse) return session;

  try {
    const body = await req.json();
    const {
      capexBudget,
      capexYear,
      financialYearEndMonth,
      sourcesOfFunds,
      supplierConnections,
    } = body;

    if (
      typeof capexBudget !== "number" ||
      typeof capexYear !== "number" ||
      !Array.isArray(sourcesOfFunds) ||
      !Array.isArray(supplierConnections)
    ) {
      return NextResponse.json(
        { error: "Invalid settings data" },
        { status: 400 }
      );
    }

    // Financial year end month: 1–12, default December.
    const fyEnd =
      typeof financialYearEndMonth === "number" &&
      financialYearEndMonth >= 1 &&
      financialYearEndMonth <= 12
        ? financialYearEndMonth
        : 12;

    await saveSpendSettings({
      capexBudget,
      capexYear,
      financialYearEndMonth: fyEnd,
      sourcesOfFunds,
      supplierConnections,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
