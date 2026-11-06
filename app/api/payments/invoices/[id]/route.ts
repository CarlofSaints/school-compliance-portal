import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { deleteFolder } from "@/lib/controlData";
import { getContacts, getInvoices, getScreens, removeInvoice } from "@/lib/paymentData";
import { buildInbox } from "@/lib/payments";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(req, "manage_payments");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const [invoices, contacts, screens] = await Promise.all([getInvoices(), getContacts(), getScreens()]);
  // Taking an invoice off a signed notice would change what was signed for.
  if (buildInbox(invoices, contacts, screens).rows.find((r) => r.id === id)?.signedOnNotice) {
    return NextResponse.json({ error: "This invoice is on a signed payment notice, so it cannot be deleted." }, { status: 409 });
  }
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
