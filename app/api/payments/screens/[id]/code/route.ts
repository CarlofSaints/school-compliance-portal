import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/rolesData";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { hashSigningCode, mintSigningCode } from "@/lib/minutesSigning";
import { sendPaymentNoticeCodeEmail } from "@/lib/email";
import { fillsALine, getNoticeSignatures, getScreens, getSigningSlots, noticeCodeSalt, saveNoticeCode, tagsHeld } from "@/lib/paymentData";
import { noticeSlots } from "@/lib/payments";

// Emails the signer their own one-time code, as signing minutes does: proof
// that the person at the keyboard also holds the mailbox.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAnyPermission(req, ["view_payments", "manage_payments"]);
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const screens = await getScreens();
  const notice = screens.find((s) => s.id === id && s.kind !== "statement");
  const all = await getSigningSlots(screens);
  const slots = notice ? noticeSlots(notice, all) : all;
  const tagIds = tagsHeld(slots, session.id);
  if (!tagIds.length) return NextResponse.json({ error: "You are not one of the people who sign payment notices." }, { status: 403 });
  if (!notice) return NextResponse.json({ error: "Payment notice not found." }, { status: 404 });

  const signed = await getNoticeSignatures(id);
  if (signed.some((s) => s.userId === session.id)) return NextResponse.json({ error: "You have already signed this payment notice." }, { status: 409 });
  if (!fillsALine(signed, { userId: session.id, tagIds }, slots.map((s) => s.tagId))) {
    return NextResponse.json({ error: "Your line on this payment notice has already been signed." }, { status: 409 });
  }
  const limited = await enforce([[LIMITS.signCodeSend, `${id}|${session.id}`]]);
  if (limited) return limited;

  const code = mintSigningCode();
  await saveNoticeCode(id, session.id, hashSigningCode(code, noticeCodeSalt(id, session.id)));
  const total = notice.lines.reduce((sum, l) => sum + (l.amount ?? 0), 0);
  const sent = await sendPaymentNoticeCodeEmail(session.email, `${session.name} ${session.surname}`.trim(), notice.filename, notice.lines.length, total, code);
  if (!sent) return NextResponse.json({ error: "The email could not be sent. Please try again." }, { status: 502 });
  return NextResponse.json({ success: true });
}
