import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getSpendById, updateSpendApplication } from "@/lib/spendData";
import type { SpendApplication, SpendApproval } from "@/lib/spendData";
import { getPeople } from "@/lib/peopleData";
import { getApprovalSettings } from "@/lib/approvalSettings";
import {
  evaluateProgress,
  deriveStatus,
  isRequiredApprover,
} from "@/lib/approvalEngine";
import {
  sendApprovalProgressEmail,
  sendFullyApprovedEmail,
} from "@/lib/email";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

const DECISION_LABELS: Record<string, string> = {
  approved: "approved",
  rejected: "declined",
  requires_changes: "asked for changes",
  responded: "asked a question",
};

export async function POST(
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

  try {
    const body = await req.json();
    const { decision, comments, preferredQuoteIndex, forceApprove } = body;
    const note = String(comments ?? "").trim();

    // --- Admin override -----------------------------------------------------
    // Kept deliberately awkward: an override skips the people who were meant to
    // decide, so it always costs a written reason and is stamped as an override
    // in the history rather than passing for a normal approval.
    if (forceApprove) {
      if (!session.permissions.includes("manage_spend_settings")) {
        return NextResponse.json(
          { error: "Only admins can approve manually" },
          { status: 403 }
        );
      }
      if (note.length < 10) {
        return NextResponse.json(
          {
            error:
              "A manual approval needs a reason of at least 10 characters, saying why the normal approvers were bypassed.",
          },
          { status: 400 }
        );
      }

      const approvals: SpendApproval[] = [
        ...app.approvals,
        {
          userId: session.id,
          userName: `${session.name} ${session.surname}`,
          position: "Manual approval by admin",
          decision: "approved",
          comments: note,
          decidedAt: new Date().toISOString(),
          isOverride: true,
        },
      ];

      await updateSpendApplication(id, {
        status: "approved",
        approvals,
        approvedAmount: app.approvedAmount ?? app.estimatedAmount,
      });

      await recordActivity({
        ...actorFrom(req, session),
        action: "spend.approved.override",
        entity: "spend",
        entityId: app.id,
        summary: `Manually approved "${app.projectName}" for R${(
          app.approvedAmount ?? app.estimatedAmount
        ).toLocaleString()}, bypassing the normal approvers`,
        detail: {
          reason: note,
          amount: app.approvedAmount ?? app.estimatedAmount,
          bypassedApprovers: app.requiredApprovers,
          previousStatus: app.status,
        },
      });

      await notifyApplicant(app, session, "approved", note, true);
      return NextResponse.json({ success: true, status: "approved" });
    }

    // --- Normal decision ----------------------------------------------------
    if (!["approved", "rejected", "requires_changes", "responded"].includes(decision)) {
      return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
    }

    // Only the people this application actually asked may decide it. Being an
    // approver elsewhere is not enough - the list was frozen at submission.
    if (!isRequiredApprover(app, session.id)) {
      return NextResponse.json(
        {
          error:
            "You are not one of the approvers this application requires. An admin can approve it manually with a reason.",
        },
        { status: 403 }
      );
    }

    if (decision === "responded" && !note) {
      return NextResponse.json(
        { error: "A response needs a question or a comment" },
        { status: 400 }
      );
    }

    // An approver may come back after asking a question. Their earlier entries
    // stay in the history - the question and its answer are the audit trail -
    // but a real decision can only be made once.
    const alreadyDecided = app.approvals.some(
      (a) => a.userId === session.id && a.decision !== "responded"
    );
    if (alreadyDecided) {
      return NextResponse.json(
        { error: "You have already recorded your decision" },
        { status: 400 }
      );
    }

    const people = await getPeople();
    const person = people.find((p) => p.userId === session.id);
    const approver = (app.requiredApprovers || []).find(
      (a) => a.userId === session.id
    );

    const approval: SpendApproval = {
      userId: session.id,
      userName: `${session.name} ${session.surname}`,
      position: approver?.tagName || person?.position || "Approver",
      decision,
      comments: note,
      decidedAt: new Date().toISOString(),
      preferredQuoteIndex:
        preferredQuoteIndex !== undefined ? preferredQuoteIndex : undefined,
    };

    // Append rather than replace: every response is kept on the record.
    const approvals = [...app.approvals, approval];

    const preferredQuotes = [
      ...(app.preferredQuotes || []).filter((q) => q.userId !== session.id),
      ...(preferredQuoteIndex !== undefined
        ? [{ userId: session.id, quoteIndex: preferredQuoteIndex }]
        : []),
    ];

    const next = { ...app, approvals };
    const status =
      decision === "requires_changes"
        ? ("requires_changes" as const)
        : deriveStatus(next);

    const updates: Partial<SpendApplication> = {
      approvals,
      preferredQuotes,
      status,
    };
    if (status === "approved" && app.approvedAmount === undefined) {
      updates.approvedAmount = app.estimatedAmount;
    }

    await updateSpendApplication(id, updates);

    // Logged AFTER the write succeeds, so the trail never claims something
    // happened that did not. recordActivity never throws, so a logging
    // failure cannot undo a decision that has already been saved.
    await recordActivity({
      ...actorFrom(req, session),
      action: `spend.${decision}`,
      entity: "spend",
      entityId: app.id,
      summary: `${DECISION_LABELS[decision] || decision} "${app.projectName}" (R${(
        app.approvedAmount ?? app.estimatedAmount
      ).toLocaleString()})`,
      detail: {
        decision,
        comments: note || undefined,
        amount: app.approvedAmount ?? app.estimatedAmount,
        statusBefore: app.status,
        statusAfter: status,
        preferredQuoteIndex,
      },
    });

    await notifyApplicant(app, session, decision, note, false, approvals);

    const progress = evaluateProgress(next);
    return NextResponse.json({
      success: true,
      status,
      approved: progress.approved,
      total: progress.total,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Tells the applicant what just happened. Two separate messages by design: a
// running update per decision (which an admin can switch off) and a final one
// when the last approval lands, which always goes.
async function notifyApplicant(
  app: SpendApplication,
  session: { id: string; name: string; surname: string; email: string },
  decision: string,
  note: string,
  isOverride: boolean,
  approvals?: SpendApproval[]
): Promise<void> {
  const to = app.applicantEmail;
  if (!to) return;

  const applicantName =
    `${app.applicantName || ""} ${app.applicantSurname || ""}`.trim() ||
    "Applicant";
  const approverName = `${session.name} ${session.surname}`;
  const settings = await getApprovalSettings();

  const progress = evaluateProgress({
    approvals: approvals || app.approvals,
    requiredApprovers: app.requiredApprovers,
  });
  const fullyApproved = isOverride || progress.complete;

  if (fullyApproved) {
    const names = (approvals || app.approvals)
      .filter((a) => a.decision === "approved")
      .map((a) => a.userName);
    await sendFullyApprovedEmail(
      to,
      applicantName,
      app.id,
      app.projectName,
      app.approvedAmount ?? app.estimatedAmount,
      names.length > 0 ? names : [approverName]
    );
    return;
  }

  if (settings.notifyApplicantOnEachApproval) {
    await sendApprovalProgressEmail(
      to,
      applicantName,
      app.id,
      app.projectName,
      approverName,
      DECISION_LABELS[decision] || decision,
      note,
      progress.approved,
      progress.total
    );
  }
}
