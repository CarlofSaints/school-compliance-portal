import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { setReleased } from "@/lib/paymentData";

// A signer's own tick that they released the payment at the bank. Only the
// bank knows for sure, so this never makes an invoice Paid: a statement does.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAnyPermission(req, ["view_payments", "manage_payments"]);
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { released?: unknown } | null;
  const released = body?.released === true;
  if (!(await setReleased(id, session.id, released))) return NextResponse.json({ error: "Sign the invoice first." }, { status: 409 });
  await recordActivity({
    ...actorFrom(req, session),
    action: released ? "payment.released" : "payment.release_undone",
    entity: "payment",
    entityId: id,
    summary: released ? "Ticked a payment as released at the bank" : "Unticked a payment as released at the bank",
  });
  return NextResponse.json({ success: true });
}
