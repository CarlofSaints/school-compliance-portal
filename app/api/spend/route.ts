import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireLogin } from "@/lib/rolesData";
import {
  getSpendApplications,
  createSpendApplication,
  uploadQuoteFile,
} from "@/lib/spendData";
import type { QuoteDetail, FundingAllocation } from "@/lib/spendData";
import { resolveApprovers } from "@/lib/approvalResolver";
import { createReminder, todayIso } from "@/lib/reminderData";
import type { ReminderUnit } from "@/lib/reminderData";
import {
  sendApprovalRequestEmail,
  sendApplicantConfirmationEmail,
} from "@/lib/email";
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

    // Per-source funding split (new). Falls back to a single allocation from
    // the legacy sourceOfFunds string if not provided.
    let fundingAllocations: FundingAllocation[] = [];
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
        // ignore malformed payload — fall through to legacy single source
      }
    }
    if (fundingAllocations.length === 0) {
      fundingAllocations = [
        { source: sourceOfFunds, amount: estimatedAmount || 0 },
      ];
    }

    // On-behalf-of fields
    const isOnBehalf = (formData.get("onBehalf") as string) === "yes";
    const applicantName = isOnBehalf
      ? (formData.get("applicantName") as string) || ""
      : session.name;
    const applicantSurname = isOnBehalf
      ? (formData.get("applicantSurname") as string) || ""
      : session.surname;
    const applicantEmail = isOnBehalf
      ? (formData.get("applicantEmail") as string) || ""
      : session.email;
    // Set when the applicant was picked from the user dropdown rather than
    // typed in as someone outside the portal.
    const applicantUserId = isOnBehalf
      ? (formData.get("applicantUserId") as string) || undefined
      : session.id;

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
        const priceStr =
          (formData.get(`quote${i}_priceExclVat`) as string) || "0";
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

    // Who has to approve an amount of this size. Resolved once, here, and
    // frozen onto the record - see lib/approvalEngine.ts for why.
    const approval = await resolveApprovers(estimatedAmount);

    // Optional chasing, set up on the application form itself.
    const remindersOn = (formData.get("remindersOn") as string) === "yes";
    const approvalRequiredBy =
      (formData.get("approvalRequiredBy") as string) || "";
    const reminderIntervalCount = Math.max(
      1,
      parseInt((formData.get("reminderIntervalCount") as string) || "1", 10) ||
        1
    );
    const reminderIntervalUnit = ((formData.get("reminderIntervalUnit") as
      | ReminderUnit
      | null) || "week") as ReminderUnit;

    const app = {
      id: spendId,
      projectName,
      description,
      estimatedAmount,
      supplierConnection,
      budgeted,
      sourceOfFunds,
      fundingAllocations,
      quotes: quotePaths,
      quoteDetails,
      // A "logged only" band needs no approval, so it is recorded as approved
      // straight away. Every other band waits for real people - nothing else
      // auto-approves.
      status: (approval.logOnly ? "approved" : "pending") as
        | "pending"
        | "approved",
      approvalTierId: approval.tierId,
      approvalTierLabel: approval.tierLabel,
      approvalLogOnly: approval.logOnly,
      requiredApprovers: approval.approvers,
      approvalWarning: approval.warning,
      ...(approval.logOnly ? { approvedAmount: estimatedAmount } : {}),
      submittedBy: session.id,
      submittedByName: `${session.name} ${session.surname}`,
      submittedAt: new Date().toISOString(),
      approvals: [],
      applicantUserId,
      applicantName,
      applicantSurname,
      applicantEmail,
      submittedOnBehalf: isOnBehalf,
      preferredQuotes: [],
    };

    await createSpendApplication(app);

    // Ask exactly the people this amount requires - not every key position.
    // A logged-only band asks nobody.
    for (const approver of approval.approvers) {
      if (!approver.email) continue;
      await sendApprovalRequestEmail(
        approver.email,
        approver.name,
        spendId,
        projectName,
        sourceOfFunds,
        quoteDetails.length,
        estimatedAmount,
        `${session.name} ${session.surname}`,
        approval.tierLabel || "Approval required",
        approvalRequiredBy || undefined
      );
    }

    // The applicant's own copy. Sent on EVERY submission - this used to be
    // gated on isOnBehalf, so anyone applying for themselves (the common case)
    // got nothing back and had no confirmation their application had landed.
    // applicantEmail already falls back to the submitter's address above.
    if (applicantEmail) {
      const approverNames = approval.approvers.map(
        (a) => `${a.name} (${a.tagName})`
      );
      await sendApplicantConfirmationEmail(
        applicantEmail,
        `${applicantName} ${applicantSurname}`,
        // null = they submitted it themselves, so the mail does not name a
        // separate submitter.
        isOnBehalf ? `${session.name} ${session.surname}` : null,
        projectName,
        quotePaths.length,
        approverNames
      );
    }

    // Chase the approvers (and keep the applicant in the loop) until a decision
    // is made. Skipped entirely for a logged-only band, where there is nobody
    // to chase.
    if (remindersOn && !approval.logOnly && approval.approvers.length > 0) {
      const start = approvalRequiredBy || todayIso();
      await createReminder({
        id: uuidv4(),
        spendId,
        projectName,
        recipients: ["custodian", "submitter"],
        nextRunAt: start < todayIso() ? todayIso() : start,
        frequency: "custom",
        intervalCount: reminderIntervalCount,
        intervalUnit: reminderIntervalUnit,
        anchorDay: Number((start || todayIso()).slice(8, 10)),
        note: approvalRequiredBy
          ? `This application is still waiting for approval. It was needed by ${approvalRequiredBy}.`
          : "This application is still waiting for approval.",
        active: true,
        spendStopOnDecision: true,
        approvalRequiredBy: approvalRequiredBy || undefined,
        createdBy: session.id,
        createdByName: `${session.name} ${session.surname}`,
        createdAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({ id: spendId }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
