import { isRegisterImport } from "@/lib/approvalEngine";
import { NextRequest, NextResponse } from "next/server";
import { spendRefusalResponse, spendConflictResponse } from "@/lib/spendConflict";
import { requireLogin, requirePermission } from "@/lib/rolesData";
import {
  getSpendById,
  updateSpendApplication,
  SpendChangeRefused,
  SpendEditConflict,
  changedSince,
  uploadQuoteFile,
  deleteSpendApplication,
} from "@/lib/spendData";
import type { QuoteDetail, FundingAllocation, SpendApplication } from "@/lib/spendData";
import { pickSpendEditFields } from "@/lib/spend";
import { resolveApprovers } from "@/lib/approvalResolver";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { sendApprovalRequestEmail } from "@/lib/email";

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
    // The editable fields as the edit page loaded them. If ANY of them has
    // changed since (someone else saved the details), the save is refused
    // here, before a quote file is uploaded, and nothing is written. No
    // merging: a stale form must never quietly undo part of their change.
    // Votes, notes and reminders touch other fields and refuse nobody.
    let base: Partial<SpendApplication> | undefined;
    try {
      const raw = formData.get("base");
      if (typeof raw === "string" && raw) base = pickSpendEditFields(JSON.parse(raw));
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    if (base) {
      const moved = changedSince(app, base);
      if (moved.length > 0) return spendConflictResponse(app, moved);
    }
    const projectName =
      (formData.get("projectName") as string) || app.projectName;
    const description =
      (formData.get("description") as string) || app.description;
    const estimatedAmountStr = formData.get("estimatedAmount") as string;
    const estimatedAmount = estimatedAmountStr
      ? parseFloat(estimatedAmountStr)
      : app.estimatedAmount;
    if (!Number.isFinite(estimatedAmount) || estimatedAmount < 0) {
      return NextResponse.json(
        { error: "The estimated amount must be a number of rand." },
        { status: 400 }
      );
    }
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
    const wasOnBehalf = !!app.submittedOnBehalf;
    const isOnBehalf =
      onBehalfStr !== null ? onBehalfStr === "yes" : app.submittedOnBehalf;
    const applicantName = isOnBehalf
      ? (formData.get("applicantName") as string) || app.applicantName
      : wasOnBehalf ? session.name : app.applicantName;
    const applicantSurname = isOnBehalf
      ? (formData.get("applicantSurname") as string) || app.applicantSurname
      : wasOnBehalf ? session.surname : app.applicantSurname;
    const applicantEmail = isOnBehalf
      ? (formData.get("applicantEmail") as string) || app.applicantEmail
      : wasOnBehalf ? session.email : app.applicantEmail;
    // Not on behalf, and it never was: the applicant stays who it is (an admin
    // fixing a typo must not become it). Switched off "on behalf": the person
    // saving is the applicant, as on a new application.
    // The applicant is a portal user where one was picked. An empty string is
    // a real choice ("someone not on the portal"), so only fall back to the
    // saved value when the form did not send the field at all.
    const applicantUserIdRaw = formData.get("applicantUserId");
    const applicantUserId = !isOnBehalf
      ? wasOnBehalf ? session.id : app.applicantUserId
      : applicantUserIdRaw === null
        ? app.applicantUserId
        : (applicantUserIdRaw as string) || undefined;

    // Handle quote files - check for new uploads
    const quotePaths = [...app.quotes];
    const quoteDetails = [...app.quoteDetails];

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

    // Set only when this edit decides the status (votes restarted, re-banded);
    // otherwise it is worked out from the record at save time, below.
    let newStatus: SpendApplication["status"] | undefined;

    const mine = {
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
    };

    // 🔴 A new amount is a new application as far as approval goes. The band,
    // and so WHO must approve, was frozen at submission; keeping it after the
    // amount changed let R9 000 approved by the Principal become R250 000 with
    // no FINCOM sign-off. So the approvers are worked out again and every
    // decision so far is cleared.
    const amountChanged = Math.abs(mine.estimatedAmount - (Number(app.estimatedAmount) || 0)) >= 0.01;
    // Any edit after votes have been cast restarts them, not just a new
    // amount: a swapped quote, supplier or description is a different
    // application from the one the earlier approvers said yes to.
    const hadVotes =
      (app.approvals?.length ?? 0) > 0 &&
      (app.status === "pending" || app.status === "pending_decision");
    // The first edit of an untouched imported row makes it an ordinary
    // application, so it is banded like a new submission: its approvers are
    // worked out and told. Rows already put to a vote keep their approvers
    // (frozen at submission). shortcut: read before the save, so two edits in
    // the same second can both band and email; fine at school scale.
    // Only a still-PENDING one: a rejected or historical row is not re-banded
    // (a log-only band would otherwise approve a rejected row over a typo).
    const firstImportEdit =
      isRegisterImport(app) && (app.status === "pending" || app.status === "pending_decision");
    let reband: Partial<SpendApplication> = {};
    if (hadVotes && !amountChanged) {
      newStatus = "pending";
      reband = { approvals: [], preferredQuotes: [] };
    }
    if (amountChanged || firstImportEdit) {
      const approval = await resolveApprovers(mine.estimatedAmount);
      newStatus = approval.logOnly ? "approved" : "pending";
      reband = {
        approvalTierId: approval.tierId,
        approvalTierLabel: approval.tierLabel,
        approvalLogOnly: approval.logOnly,
        requiredApprovers: approval.approvers,
        approvalWarning: approval.warning,
        approvals: [],
        preferredQuotes: [],
        approvedAmount: approval.logOnly ? mine.estimatedAmount : undefined,
      };
    }

    // 🔴 The vote-restart rule is applied again to the application AS IT IS
    // AT SAVE TIME: an approval that landed while this edit was being made
    // was cast on the old wording, so it is cleared too.
    let restartedNow = false;
    const saved = await updateSpendApplication(id, (current) => {
      // Approved or completed while this page was open: no longer editable,
      // and saving again will not change that.
      if (current.status === "approved" || current.status === "completed") {
        throw new SpendChangeRefused("Cannot edit approved or completed applications", 400);
      }
      // The same check against the record AS IT IS NOW, for a save that
      // landed in the moment since. shortcut: a quote uploaded in that moment
      // has already replaced the file at its fixed path; that window is the
      // length of one upload, fine at school scale.
      if (base) {
        const moved = changedSince(current, base);
        if (moved.length > 0) throw new SpendEditConflict(current, moved);
      }
      const votesNow =
        (current.approvals?.length ?? 0) > 0 &&
        (current.status === "pending" || current.status === "pending_decision");
      restartedNow = votesNow && !hadVotes && !amountChanged;
      return {
      ...mine,
      // A resubmission after changes goes back to pending; otherwise the
      // status as it is NOW, never the copy read at the start of the request.
      status:
        newStatus ??
        (current.status === "requires_changes" || current.status === "rejected"
          ? "pending"
          : current.status),
      // Clear approvals on re-submission after changes
      ...(current.status === "requires_changes" || current.status === "rejected"
        ? { approvals: [], preferredQuotes: [] }
        : {}),
      ...reband,
      // The first edit takes an imported row out of its batch (see
      // importBatchId): an ordinary application from now on, which Undo
      // import no longer deletes. Read from the record AS IT IS NOW.
      importBatchId: undefined,
      ...(votesNow && !amountChanged ? { approvals: [], preferredQuotes: [], status: "pending" as const } : {}),
      };
    }, { byName: actorFrom(req, session).actorName });

    // Removed meanwhile (Undo import, a delete): nothing was saved.
    if (!saved) {
      return NextResponse.json({ error: "Spend application not found" }, { status: 404 });
    }

    // Whoever has to decide now must be TOLD, as on a new application. A
    // re-banded application otherwise sat waiting on people who never heard
    // of it.
    if (amountChanged || hadVotes || restartedNow || firstImportEdit) {
      const approvers = (reband.requiredApprovers ?? app.requiredApprovers ?? []) as { name: string; email: string }[];
      const needsApproval = !(reband.approvalLogOnly ?? app.approvalLogOnly);
      if (needsApproval) {
        for (const approver of approvers) {
          if (!approver.email) continue;
          try {
            await sendApprovalRequestEmail(
              approver.email,
              approver.name,
              app.id,
              saved.projectName,
              saved.sourceOfFunds,
              saved.quoteDetails.length,
              saved.estimatedAmount,
              app.submittedByName,
              (reband.approvalTierLabel ?? app.approvalTierLabel) || "Approval required"
            );
          } catch (err) {
            console.error("[spend] approver email after edit failed:", err);
          }
        }
      }
    }

    if (hadVotes && !amountChanged) {
      await recordActivity({
        ...actorFrom(req, session),
        action: "spend.approvals.restarted",
        entity: "spend",
        entityId: app.id,
        summary: `Edited "${app.projectName}" after ${app.approvals.length} decision(s); approvals restarted`,
        detail: { previousApprovals: app.approvals.length },
      });
    }

    if (firstImportEdit) {
      await recordActivity({
        ...actorFrom(req, session),
        action: "spend.import.converted",
        entity: "spend",
        entityId: app.id,
        summary: `Edited imported "${app.projectName}"; it is now an ordinary application${reband.approvalTierLabel ? ` in band "${reband.approvalTierLabel}"` : ""} and Undo import will not remove it`,
        detail: { importBatchId: app.importBatchId, band: reband.approvalTierLabel, approvers: (reband.requiredApprovers || []).length },
      });
    }

    if (amountChanged) {
      await recordActivity({
        ...actorFrom(req, session),
        action: "spend.amount.changed",
        entity: "spend",
        entityId: app.id,
        summary: `Changed "${app.projectName}" from R${Number(app.estimatedAmount || 0).toLocaleString()} to R${saved.estimatedAmount.toLocaleString()}; approvals restarted`,
        detail: { from: app.estimatedAmount, to: saved.estimatedAmount, previousApprovals: app.approvals?.length ?? 0 },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const refused = await spendRefusalResponse(err);
    if (refused) return refused;
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Permanently removes a project. Gated on its own delete_spend permission -
// deleting is not the same authority as editing, so it is not folded into the
// edit check above.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "delete_spend");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  try {
    const removed = await deleteSpendApplication(id);
    if (!removed) {
      return NextResponse.json(
        { error: "Spend application not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({
      success: true,
      projectName: removed.projectName,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
