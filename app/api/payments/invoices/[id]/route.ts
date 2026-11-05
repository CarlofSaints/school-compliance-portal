import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { deleteFolder } from "@/lib/controlData";
import { removeInvoice } from "@/lib/paymentData";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(req, "manage_payments");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const removed = await removeInvoice(id);
  if (!removed) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  if (removed === "signed") return NextResponse.json({ error: "A signed invoice cannot be deleted." }, { status: 409 });
  await deleteFolder(`payments/invoices/${id}`);
  await recordActivity({
    ...actorFrom(req, session),
    action: "payment.invoice_deleted",
    entity: "payment",
    entityId: id,
    summary: `Deleted invoice ${removed.filename}`,
  });
  return NextResponse.json({ success: true });
}
