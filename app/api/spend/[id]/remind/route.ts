import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import {
  getSpendById,
  updateSpendApplication,
  getCustodian,
} from "@/lib/spendData";
import type { ManualReminder } from "@/lib/spendData";
import { evaluateProgress } from "@/lib/approvalEngine";
import { sendApprovalReminderEmail } from "@/lib/email";

// Sending mail to real people, on demand, from a button. A short cooldown stops
// an impatient click - or a double-click - turning into a pile of duplicate
// emails in an approver's inbox.
const COOLDOWN_MINUTES = 60;

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

  // The people with standing to chase: whoever the money is for, whoever
  // captured it, whoever is accountable for it, and spend admins.
  const isApplicant = !!app.applicantUserId && app.applicantUserId === session.id;
  const isSubmitter = app.submittedBy === session.id;
  const isCustodian = getCustodian(app).userId === session.id;
  const isAdmin = session.permissions.includes("manage_spend_settings");

  if (!isApplicant && !isSubmitter && !isCustodian && !isAdmin) {
    return NextResponse.json(
      {
        error:
          "Only the applicant, the person who submitted it, the custodian or an admin can send a reminder.",
      },
      { status: 403 }
    );
  }

  if (app.approvalLogOnly) {
    return NextResponse.json(
      { error: "This amount needs no approval, so there is nobody to remind." },
      { status: 400 }
    );
  }
  if (app.status === "approved" || app.status === "completed") {
    return NextResponse.json(
      { error: "This application is already approved." },
      { status: 400 }
    );
  }
  if (app.status === "rejected") {
    return NextResponse.json(
      { error: "This application was declined." },
      { status: 400 }
    );
  }

  const progress = evaluateProgress(app);
  const waiting = progress.outstanding.filter((a) => a.email);

  if (waiting.length === 0) {
    return NextResponse.json(
      {
        error:
          progress.outstanding.length > 0
            ? "The remaining approvers have no email address on record."
            : "Nobody is outstanding on this application.",
      },
      { status: 400 }
    );
  }

  // Cooldown, measured from the last manual nudge on THIS application.
  const history = app.manualReminders || [];
  const last = history[history.length - 1];
  if (last) {
    const minutesSince =
      (Date.now() - new Date(last.at).getTime()) / 60000;
    if (minutesSince < COOLDOWN_MINUTES) {
      const wait = Math.ceil(COOLDOWN_MINUTES - minutesSince);
      return NextResponse.json(
        {
          error: `A reminder was already sent ${Math.floor(minutesSince)} minute${
            Math.floor(minutesSince) === 1 ? "" : "s"
          } ago by ${last.byName}. You can send another in ${wait} minute${
            wait === 1 ? "" : "s"
          }.`,
        },
        { status: 429 }
      );
    }
  }

  const waitingDays = Math.floor(
    (Date.now() - new Date(app.submittedAt).getTime()) / 86400000
  );
  const chasedBy = `${session.name} ${session.surname}`.trim();
  const outstandingNames = waiting.map((a) => a.name);

  const sentTo: string[] = [];
  const failed: string[] = [];
  for (const approver of waiting) {
    const ok = await sendApprovalReminderEmail(
      approver.email,
      approver.name,
      app.id,
      app.projectName,
      app.sourceOfFunds,
      app.quoteDetails?.length || 0,
      app.estimatedAmount,
      waitingDays,
      chasedBy,
      outstandingNames
    );
    if (ok) sentTo.push(approver.name);
    else failed.push(approver.name);
  }

  // Only record a nudge that actually went, so a failed send does not start the
  // cooldown and lock the applicant out of trying again.
  if (sentTo.length > 0) {
    const entry: ManualReminder = {
      at: new Date().toISOString(),
      byUserId: session.id,
      byName: chasedBy,
      sentTo,
    };
    await updateSpendApplication(id, {
      manualReminders: [...history, entry].slice(-20),
    });
  }

  return NextResponse.json({
    success: sentTo.length > 0,
    sentTo,
    failed,
    waitingDays,
  });
}
