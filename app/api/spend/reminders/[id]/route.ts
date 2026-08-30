import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { deleteReminder, getReminders } from "@/lib/reminderData";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const reminder = (await getReminders()).find((r) => r.id === id);
  if (!reminder) {
    return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
  }

  // The person who set it, or a spend admin, can cancel it.
  const canManage =
    reminder.createdBy === session.id ||
    session.permissions.includes("manage_spend_settings");
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deleteReminder(id);
  return NextResponse.json({ success: true });
}
