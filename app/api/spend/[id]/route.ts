import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import {
  getSpendById,
  updateSpendApplication,
  uploadQuoteFile,
} from "@/lib/spendData";
import type { QuoteDetail, FundingAllocation } from "@/lib/spendData";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const app = await getSpendById(id);
  if (!app) {
    return NextResponse.json(
      { error: "Spend application not found" },
      { status: 404 }
    );
  }

  // Check access
  if (
    app.submittedBy !== session.id &&
    !session.permissions.includes("view_all_spend") &&
    !session.permissions.includes("approve_spend")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(app);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const app = await getSpendById(id);
  if (!app) {
    return NextResponse.json(
      { error: "Spend application not found" },
      { status: 404 }
    );
  }

  // Check permissions: only submitter or admin can edit
  const isSubmitter = app.submittedBy === session.id;
  const isAdmin =
    session.permissions.includes("manage_spend_settings") ||
    session.permissions.includes("manage_users");

  if (!isSubmitter && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Cannot edit approved or completed applications
  if (app.status === "approved" || app.status === "completed") {
    return NextResponse.json(
      { error: "Cannot edit approved or completed applications" },
      { status: 400 }
    );
  }

  try {
    const formData = await req.formData();
    const projectName =
      (formData.get("projectName") as string) || app.projectName;
    const description =
      (formData.get("description") as string) || app.description;
    const estimatedAmountStr = formData.get("estimatedAmount") as string;
    const estimatedAmount = estimatedAmountStr
      ? parseFloat(estimatedAmountStr)
      : app.estimatedAmount;
    const supplierConnection =
      (formData.get("supplierConnection") as string) || app.supplierConnection;
    const budgetedStr = formData.get("budgeted") as string;
    const budgeted =
      budgetedStr !== null ? budgetedStr === "yes" : app.budgeted;
    const sourceOfFunds =
      (formData.get("sourceOfFunds") as string) || app.sourceOfFunds;

    // Per-source funding split. Keep the existing split if none is supplied.
    let fundingAllocations: FundingAllocation[] | undefined =
      app.fundingAllocations;
    const allocationsRaw = formData.get("fundingAllocations") as string | null;
    if (allocationsRaw) {
      try {
        const parsed = JSON.parse(allocationsRaw);
        if (Array.isArray(parsed)) {
          fundingAllocations = parsed
            .filter((a) => a && typeof a.source === "string")
            .map((a) => ({ source: a.source, amount: Number(a.amount) || 0 }));
        }
      } catch {
        // ignore malformed payload — keep existing allocations
      }
    }

    // On-behalf-of fields
    const onBehalfStr = formData.get("onBehalf") as string;
    const isOnBehalf =
      onBehalfStr !== null ? onBehalfStr === "yes" : app.submittedOnBehalf;
    const applicantName = isOnBehalf
      ? (formData.get("applicantName") as string) || app.applicantName
      : session.name;
    const applicantSurname = isOnBehalf
      ? (formData.get("applicantSurname") as string) || app.applicantSurname
      : session.surname;
    const applicantEmail = isOnBehalf
      ? (formData.get("applicantEmail") as string) || app.applicantEmail
      : session.email;
    // The applicant is a portal user where one was picked. An empty string is
    // a real choice ("someone not on the portal"), so only fall back to the
    // saved value when the form did not send the field at all.
    const applicantUserIdRaw = formData.get("applicantUserId");
    const applicantUserId = !isOnBehalf
      ? undefined
      : applicantUserIdRaw === null
        ? app.applicantUserId
        : (applicantUserIdRaw as string) || undefined;

    // Handle quote files - check for new uploads
    let quotePaths = [...app.quotes];
    let quoteDetails = [...app.quoteDetails];

    for (let i = 1; i <= 4; i++) {
      const quoteFile = formData.get(`quote${i}`) as File | null;
      if (quoteFile && quoteFile.size > 0) {
        const ext = quoteFile.name.split(".").pop() || "pdf";
        const buffer = Buffer.from(await quoteFile.arrayBuffer());
        const path = await uploadQuoteFile(id, i, ext, buffer);

        // Replace or add the quote at this index
        if (i - 1 < quotePaths.length) {
          quotePaths[i - 1] = path;
        } else {
          quotePaths.push(path);
        }

        const priceStr =
          (formData.get(`quote${i}_priceExclVat`) as string) || "0";
        const newDetail: QuoteDetail = {
          supplierName:
            (formData.get(`quote${i}_supplierName`) as string) || "",
          supplierWebsite:
            (formData.get(`quote${i}_supplierWebsite`) as string) || undefined,
          supplierEmail:
            (formData.get(`quote${i}_supplierEmail`) as string) || "",
          supplierPhone:
            (formData.get(`quote${i}_supplierPhone`) as string) || undefined,
          priceExclVat: parseFloat(priceStr) || 0,
        };

        if (i - 1 < quoteDetails.length) {
          quoteDetails[i - 1] = newDetail;
        } else {
          quoteDetails.push(newDetail);
        }
      } else {
        // Update quote details even without new file
        const supplierName = formData.get(
          `quote${i}_supplierName`
        ) as string | null;
        if (supplierName !== null && i - 1 < quoteDetails.length) {
          const priceStr =
            (formData.get(`quote${i}_priceExclVat`) as string) || "0";
          quoteDetails[i - 1] = {
            supplierName,
            supplierWebsite:
              (formData.get(`quote${i}_supplierWebsite`) as string) ||
              undefined,
            supplierEmail:
              (formData.get(`quote${i}_supplierEmail`) as string) || "",
            supplierPhone:
              (formData.get(`quote${i}_supplierPhone`) as string) || undefined,
            priceExclVat: parseFloat(priceStr) || 0,
          };
        }
      }
    }

    // If status was requires_changes, reset to pending on edit
    const newStatus =
      app.status === "requires_changes" || app.status === "rejected"
        ? "pending"
        : app.status;

    await updateSpendApplication(id, {
      projectName,
      description,
      estimatedAmount,
      supplierConnection,
      budgeted,
      sourceOfFunds,
      fundingAllocations,
      quotes: quotePaths,
      quoteDetails,
      applicantUserId,
      applicantName,
      applicantSurname,
      applicantEmail,
      submittedOnBehalf: isOnBehalf,
      status: newStatus,
      // Clear approvals on re-submission after changes
      ...(app.status === "requires_changes" || app.status === "rejected"
        ? { approvals: [], preferredQuotes: [] }
        : {}),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
