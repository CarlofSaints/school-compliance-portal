import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireLogin } from "@/lib/rolesData";
import {
  getSpendApplications,
  createSpendApplication,
  uploadQuoteFile,
} from "@/lib/spendData";
import type { QuoteDetail } from "@/lib/spendData";
import { getPeopleByPositions } from "@/lib/peopleData";
import { sendSpendNotificationEmail } from "@/lib/email";
import { v4 as uuidv4 } from "uuid";

export async function GET(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const apps = await getSpendApplications();

  // If user can view all, return all; otherwise filter to their own
  if (session.permissions.includes("view_all_spend")) {
    return NextResponse.json(apps);
  }
  const filtered = apps.filter((a) => a.submittedBy === session.id);
  return NextResponse.json(filtered);
}

export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "submit_spend");
  if (session instanceof NextResponse) return session;

  try {
    const formData = await req.formData();
    const projectName = formData.get("projectName") as string;
    const description = formData.get("description") as string;
    const estimatedAmount = parseFloat(
      formData.get("estimatedAmount") as string
    );
    const supplierConnection =
      (formData.get("supplierConnection") as string) || "None";
    const budgeted = (formData.get("budgeted") as string) === "yes";
    const sourceOfFunds =
      (formData.get("sourceOfFunds") as string) || "Fundraising";

    if (!projectName || !description || isNaN(estimatedAmount)) {
      return NextResponse.json(
        { error: "Project name, description, and amount are required" },
        { status: 400 }
      );
    }

    const spendId = uuidv4();
    const quotePaths: string[] = [];
    const quoteDetails: QuoteDetail[] = [];

    // Handle up to 4 quote files
    for (let i = 1; i <= 4; i++) {
      const quoteFile = formData.get(`quote${i}`) as File | null;
      if (quoteFile && quoteFile.size > 0) {
        const ext = quoteFile.name.split(".").pop() || "pdf";
        const buffer = Buffer.from(await quoteFile.arrayBuffer());
        const path = await uploadQuoteFile(spendId, i, ext, buffer);
        quotePaths.push(path);
        const priceStr = (formData.get(`quote${i}_priceExclVat`) as string) || "0";
        quoteDetails.push({
          supplierName:
            (formData.get(`quote${i}_supplierName`) as string) || "",
          supplierWebsite:
            (formData.get(`quote${i}_supplierWebsite`) as string) || undefined,
          supplierEmail:
            (formData.get(`quote${i}_supplierEmail`) as string) || "",
          supplierPhone:
            (formData.get(`quote${i}_supplierPhone`) as string) || undefined,
          priceExclVat: parseFloat(priceStr) || 0,
        });
      }
    }

    const app = {
      id: spendId,
      projectName,
      description,
      estimatedAmount,
      supplierConnection,
      budgeted,
      sourceOfFunds,
      quotes: quotePaths,
      quoteDetails,
      status: "pending" as const,
      submittedBy: session.id,
      submittedByName: `${session.name} ${session.surname}`,
      submittedAt: new Date().toISOString(),
      approvals: [],
    };

    await createSpendApplication(app);

    // Send email notifications to key positions
    const approvers = await getPeopleByPositions([
      "Principal",
      "SGB Treasurer",
      "SGB Chairperson",
      "SGB Vice Chairperson",
    ]);

    for (const person of approvers) {
      if (person.email) {
        await sendSpendNotificationEmail(
          person.email,
          person.name,
          projectName,
          estimatedAmount,
          `${session.name} ${session.surname}`
        );
      }
    }

    return NextResponse.json({ id: spendId }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
