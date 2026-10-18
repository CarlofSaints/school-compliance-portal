import { NextRequest, NextResponse } from "next/server";
import { LIMITS, enforce, ipOf } from "@/lib/rateLimit";
import { isSameOriginWrite } from "@/lib/session";
import { recordActivity } from "@/lib/activityLog";
import { approveCreditRequest, requestForLink } from "@/lib/creditRequests";
import { sendCreditsAddedEmail } from "@/lib/email";

// The "Payment received: add the credits" link in School Compliance's order
// email. No login: the one-time secret in the link is the proof, and it only
// ever exists in that email (lib/creditRequests.ts).

// ?id=&token= -> what the link would add, for the page to show before the click.
export async function GET(req: NextRequest) {
  const limited = await enforce([[LIMITS.creditApproveIp, ipOf(req)]]);
  if (limited) return limited;
  const id = req.nextUrl.searchParams.get("id") || "";
  const token = req.nextUrl.searchParams.get("token") || "";
  const found = await requestForLink(id, token);
  if ("error" in found) return NextResponse.json({ error: found.error }, { status: 404 });
  const r = found.request;
  return NextResponse.json({
    credits: r.credits,
    amountRand: r.amountRand,
    reference: r.reference,
    requestedBy: r.requestedBy.name,
    requestedAt: r.requestedAt,
    status: r.status,
  });
}

// POST, never GET: mail scanners open links by themselves, and one that added
// credits on arrival would add them before the payment was ever checked.
export async function POST(req: NextRequest) {
  if (
    !isSameOriginWrite(
      req.method,
      req.headers.get("origin"),
      req.headers.get("x-forwarded-host") || req.headers.get("host")
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const limited = await enforce([[LIMITS.creditApproveIp, ipOf(req)]]);
  if (limited) return limited;

  const { id, token } = await req.json().catch(() => ({ id: "", token: "" }));
  const result = await approveCreditRequest(String(id || ""), String(token || ""));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const r = result.request;
  await recordActivity({
    actorName: "School Compliance (payment received)",
    actorEmail: "",
    action: "translation_credits.added",
    entity: "system",
    summary: `${r.credits} translation credits added after EFT payment (R${r.amountRand}). Balance ${result.balance}.`,
    detail: { requestId: r.id, credits: r.credits, balance: result.balance },
  });
  await sendCreditsAddedEmail(r.requestedBy.email, r.requestedBy.name, r.credits, result.balance).catch(() => false);

  return NextResponse.json({ ok: true, credits: r.credits, balance: result.balance });
}
