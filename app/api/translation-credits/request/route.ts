import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { getUserById } from "@/lib/userData";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { recordActivity } from "@/lib/activityLog";
import { createCreditRequest, MAX_PACKS } from "@/lib/creditRequests";
import { sendCreditOrderEmail, sendCreditOrderConfirmationEmail } from "@/lib/email";

// { packs, reference } -> an EFT order for translation credits. Nothing is
// added here: School Compliance invoices, and adds the credits from the link
// in its email once the payment is in (lib/creditRequests.ts).
export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_users");
  if (session instanceof NextResponse) return session;

  let body: { packs?: unknown; reference?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // Refused below.
  }
  const packs = body.packs;
  const reference = typeof body.reference === "string" ? body.reference.trim() : "";
  if (typeof packs !== "number" || !Number.isInteger(packs) || packs < 1 || packs > MAX_PACKS) {
    return NextResponse.json({ error: `Choose between 1 and ${MAX_PACKS} packs.` }, { status: 400 });
  }
  if (reference.length > 60) {
    return NextResponse.json({ error: "Keep the reference to 60 characters." }, { status: 400 });
  }

  const limited = await enforce([[LIMITS.creditRequestUser, session.id]]);
  if (limited) return limited;

  const user = await getUserById(session.id);
  const requestedBy = {
    id: session.id,
    name: user ? `${user.name} ${user.surname}`.trim() : session.email,
    email: user?.email || session.email,
  };
  const { request, token } = await createCreditRequest({ packs, reference, requestedBy });

  // This school's own address, so the link opens the store the request is in
  // (the shared app serves many schools from one deployment).
  const approveUrl = `${req.nextUrl.origin}/credits-approve?id=${encodeURIComponent(request.id)}&token=${encodeURIComponent(token)}`;
  const sent = await sendCreditOrderEmail({ ...request, approveUrl });
  if (!sent) {
    return NextResponse.json(
      { error: "Your request could not be sent just now. Please try again in a moment." },
      { status: 502 }
    );
  }
  await sendCreditOrderConfirmationEmail(requestedBy.email, requestedBy.name, request).catch(() => false);

  await recordActivity({
    actorName: requestedBy.name,
    actorEmail: requestedBy.email,
    action: "translation_credits.requested",
    entity: "system",
    summary: `Asked for ${request.credits} translation credits (R${request.amountRand}) by EFT`,
    detail: { requestId: request.id, packs, credits: request.credits, reference },
  });

  return NextResponse.json({ ok: true, credits: request.credits, amountRand: request.amountRand });
}
