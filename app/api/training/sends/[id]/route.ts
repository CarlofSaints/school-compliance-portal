import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { cancelSend, stopReminders } from "@/lib/campusSends";

// { action: "cancel" } a scheduled send, or { action: "stop" } its reminders.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(req, "manage_training");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const saved = body.action === "cancel" ? await cancelSend(id) : body.action === "stop" ? await stopReminders(id) : null;
  return saved ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "That could not be changed." }, { status: 409 });
}
