import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { addSignature, getContacts, getInvoices, getScreens, getSignatures, signingTags } from "@/lib/paymentData";
import { buildInbox } from "@/lib/payments";

const PNG = "data:image/png;base64,";
const MAX_SIGNATURE = 400_000;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAnyPermission(req, ["view_payments", "manage_payments"]);
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const signatures = await getSignatures(id);
  return NextResponse.json(
    signatures.map(({ name, at, dataUrl, override }) => ({ name, at, dataUrl, override })),
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAnyPermission(req, ["view_payments", "manage_payments"]);
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const tagIds = await signingTags(session.id);
  if (!tagIds.length) return NextResponse.json({ error: "You are not one of the people who sign invoices." }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { dataUrl?: unknown; kind?: unknown; override?: unknown } | null;
  const dataUrl = body?.dataUrl;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(PNG) || dataUrl.length > MAX_SIGNATURE) {
    return NextResponse.json({ error: "Add your signature first." }, { status: 400 });
  }

  const [invoices, contacts, screens] = await Promise.all([getInvoices(), getContacts(), getScreens()]);
  const invoice = invoices.find((i) => i.id === id);
  const row = buildInbox(invoices, contacts, screens).rows.find((r) => r.id === id);
  if (!invoice || !row) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  // Judged from the live checks, not what the page showed when it opened.
  const red = row.bank.status === "mismatch" || row.amount.status === "mismatch";
  if (red && body?.override !== true) {
    return NextResponse.json({ error: "This invoice has a red check. Tick the box to say you have looked into it, then sign." }, { status: 409 });
  }

  const name = `${session.name} ${session.surname}`.trim();
  const added = await addSignature(id, {
    userId: session.id,
    name,
    at: new Date().toISOString(),
    tagIds,
    dataUrl,
    kind: body?.kind === "typed" ? "typed" : "drawn",
    fileHash: invoice.hash,
    bank: row.bank.status,
    amount: row.amount.status,
    override: red,
  });
  if (!added) return NextResponse.json({ error: "You have already signed this invoice." }, { status: 409 });
  await recordActivity({
    ...actorFrom(req, session),
    action: red ? "payment.invoice_signed_over_red" : "payment.invoice_signed",
    entity: "payment",
    entityId: id,
    summary: `${red ? "Signed despite a red check: invoice" : "Signed invoice"} ${invoice.filename}`,
  });
  return NextResponse.json({ success: true }, { status: 201 });
}
