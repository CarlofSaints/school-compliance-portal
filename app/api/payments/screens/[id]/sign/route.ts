import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { SignatureError, decodeSignature, signCodeLimitKey, signingCodeMatches } from "@/lib/minutesSigning";
import { addNoticeSignature, codeExpired, getContacts, getInvoices, getNoticeCodes, getScreens, getSigningSlots, noticeCodeSalt, spendNoticeCode, tagsHeld } from "@/lib/paymentData";
import { buildInbox, noticeSlots } from "@/lib/payments";

// Signs the payment notice: a signing tag, the code emailed to them, and a mark.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAnyPermission(req, ["view_payments", "manage_payments"]);
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const [invoices, contacts, screens, codes] = await Promise.all([getInvoices(), getContacts(), getScreens(), getNoticeCodes(id)]);
  const all = await getSigningSlots(screens);
  const screen = screens.find((s) => s.id === id && s.kind !== "statement");
  const slots = screen ? noticeSlots(screen, all) : all;
  const tagIds = tagsHeld(slots, session.id);
  if (!tagIds.length) return NextResponse.json({ error: "You are not one of the people who sign payment notices." }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { dataUrl?: unknown; kind?: unknown; override?: unknown; code?: unknown } | null;
  const dataUrl = typeof body?.dataUrl === "string" ? body.dataUrl : "";
  // Before the code is checked, so a bad mark does not use up a try.
  try {
    decodeSignature(dataUrl);
  } catch (e) {
    if (e instanceof SignatureError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }

  const notice = buildInbox(invoices, contacts, screens, all).notices.find((n) => n.id === id);
  if (!screen || !notice) return NextResponse.json({ error: "Payment notice not found." }, { status: 404 });

  const mine = codes[session.id];
  const limited = await enforce([[LIMITS.signCodeAttempt, signCodeLimitKey(`notice:${id}`, { email: session.email, codeSentAt: mine?.sentAt })]]);
  if (limited) return limited;
  if (typeof body?.code !== "string" || !signingCodeMatches(body.code, noticeCodeSalt(id, session.id), mine?.hash)) {
    await recordActivity({
      ...actorFrom(req, session),
      action: "payment.notice_sign_failed",
      entity: "payment",
      entityId: id,
      summary: `Wrong signing code entered for payment notice ${screen.filename}`,
    });
    return NextResponse.json({ error: "That code does not match. Check the email you were sent, or send yourself a new one." }, { status: 400 });
  }

  if (codeExpired(mine.sentAt)) return NextResponse.json({ error: "That code has expired. Send yourself a new one." }, { status: 400 });

  // Judged from the live checks, not what the page showed when it opened.
  const unchecked = notice.lines.some((l) => l.bank.status !== "match" || l.amountMatch.status !== "match");
  if (unchecked && body?.override !== true) {
    return NextResponse.json({ error: "Not every check on this payment notice is green. Tick the box to say you have looked into it, then sign." }, { status: 409 });
  }

  const outcome = await addNoticeSignature(
    id,
    {
      userId: session.id,
      name: `${session.name} ${session.surname}`.trim(),
      at: new Date().toISOString(),
      tagIds,
      dataUrl,
      kind: body?.kind === "typed" ? "typed" : "drawn",
      fileHash: screen.hash,
      override: unchecked,
      checks: notice.lines.map((l) => ({ payee: l.payee, invoiceId: l.invoiceId, bank: l.bank.status, amount: l.amountMatch.status })),
    },
    slots.map((s) => s.tagId),
    { slots: slots.map(({ tagId, label }) => ({ tagId, label })), invoiceIds: notice.lines.map((l) => l.invoiceId) }
  );
  if (outcome === "already") return NextResponse.json({ error: "You have already signed this payment notice." }, { status: 409 });
  if (outcome === "line_taken") return NextResponse.json({ error: "Your line on this payment notice has already been signed." }, { status: 409 });
  await spendNoticeCode(id, session.id);
  await recordActivity({
    ...actorFrom(req, session),
    action: unchecked ? "payment.notice_signed_not_green" : "payment.notice_signed",
    entity: "payment",
    entityId: id,
    summary: `${unchecked ? "Signed with a check not green: payment notice" : "Signed payment notice"} ${screen.filename}`,
  });
  return NextResponse.json({ success: true }, { status: 201 });
}
