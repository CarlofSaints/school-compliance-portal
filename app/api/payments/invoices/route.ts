import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission, requirePermission } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { writeFile } from "@/lib/controlData";
import { getCredits, maySpendCredits } from "@/lib/contentTranslation";
import { paidRead, readInvoice } from "@/lib/paymentAi";
import { FILE_PATHS, NO_CREDITS, addInvoice, getContacts, getInvoices, getScreens, getSigningSlots, readFailed, tagsHeld, uploadedFile } from "@/lib/paymentData";
import { buildInbox, cleanFilename, cleanInvoiceRead, type Invoice } from "@/lib/payments";

// A long PDF can take a minute to read.
export const maxDuration = 120;

// The checks are worked out on every read, so a new contact updates old rows.
export async function GET(req: NextRequest) {
  const session = await requireAnyPermission(req, ["view_payments", "manage_payments"]);
  if (session instanceof NextResponse) return session;
  const [invoices, contacts, screens, slots, balance, canSpend] = await Promise.all([
    getInvoices(),
    getContacts(),
    getScreens(),
    getSigningSlots(),
    getCredits(),
    maySpendCredits(session.id),
  ]);
  return NextResponse.json(
    {
      ...buildInbox(invoices, contacts, screens, slots),
      screens: screens.map((s) => ({ id: s.id, filename: s.filename, loadedAt: s.loadedAt, payments: s.lines.length, statement: s.kind === "statement", signed: !!s.signedBy?.length })),
      canSign: tagsHeld(slots, session.id).length > 0,
      signersChosen: slots.length > 0,
      balance,
      canSpend,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// One file per request: Vercel caps a request at 4.5 MB, so the page sends a batch one at a time.
export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_payments");
  if (session instanceof NextResponse) return session;
  const file = await uploadedFile(req, ["pdf", "png", "jpg", "webp"]);
  if (file instanceof NextResponse) return file;

  // Everything checked before the paid AI call, so a refused file costs nothing.
  const hash = createHash("sha256").update(file.bytes).digest("hex");
  const twin = (await getInvoices()).find((i) => i.hash === hash);
  if (twin) return NextResponse.json({ error: `Already loaded as ${twin.filename}.` }, { status: 409 });
  if (!(await maySpendCredits(session.id))) {
    return NextResponse.json({ error: "You are not allowed to spend credits. Ask an administrator to tick \"Can spend translation credits\" for you on Admin > Users." }, { status: 403 });
  }
  const limited = await enforce([[LIMITS.paymentReadUser, session.id], [LIMITS.paymentReadSchool, "school"]]);
  if (limited) return limited;

  const id = randomUUID();
  const stored = { filename: cleanFilename(file.name), ext: file.ext };
  const usable = (r: ReturnType<typeof cleanInvoiceRead>) => !!r.supplierName || r.amountDue !== null;
  try {
    const paid = await paidRead(async () => {
      const { data, usage } = await readInvoice(file.bytes, file.ext, Date.now() + 110_000);
      const read = cleanInvoiceRead(data);
      if (usable(read)) {
        const invoice: Invoice = { ...read, ...stored, id, hash, loadedBy: session.id, loadedByName: `${session.name} ${session.surname}`.trim(), loadedAt: new Date().toISOString(), signedBy: [] };
        await writeFile(FILE_PATHS.invoice(id, stored), file.bytes);
        await addInvoice(invoice);
      }
      return { data: read, usage };
    }, usable);
    if (!paid.ok) {
      return paid.reason === "no_credits"
        ? NextResponse.json({ error: NO_CREDITS }, { status: 402 })
        : NextResponse.json({ error: "This does not look like an invoice, so it was not loaded. Nothing was charged." }, { status: 422 });
    }
    await recordActivity({
      ...actorFrom(req, session),
      action: "payment.invoice_loaded",
      entity: "payment",
      entityId: id,
      summary: `Loaded invoice ${stored.filename}`,
    });
    return NextResponse.json({ id, supplierName: paid.data.supplierName, charged: paid.charged, balance: await getCredits() }, { status: 201 });
  } catch (err) {
    return readFailed(err);
  }
}
