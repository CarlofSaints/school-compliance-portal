import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { getSpendById, updateSpendApplication } from "@/lib/spendData";

const VALID = ["not_started", "in_progress", "completed"] as const;

// Set a project's execution progress (Not Started / In Progress / Completed).
// Independent of the financial approval status — submitter, approvers, and
// admins may update it at any time.
export async function PATCH(
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

  const isSubmitter = app.submittedBy === session.id;
  const canManage =
    session.permissions.includes("approve_spend") ||
    session.permissions.includes("manage_spend_settings") ||
    session.permissions.includes("manage_users");
  if (!isSubmitter && !canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let progress: string | undefined;
  try {
    ({ progress } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!progress || !VALID.includes(progress as (typeof VALID)[number])) {
    return NextResponse.json(
      { error: "progress must be one of: " + VALID.join(", ") },
      { status: 400 }
    );
  }

  const updated = await updateSpendApplication(id, {
    projectProgress: progress as (typeof VALID)[number],
  });
  return NextResponse.json({ success: true, projectProgress: updated?.projectProgress });
}
