import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { getUsers } from "@/lib/userData";
import { getCredits } from "@/lib/contentTranslation";
import { pendingCreditRequests } from "@/lib/creditRequests";

// The school's own view of its translation credits: the balance, and who is
// ticked to spend them, and EFT orders still waiting for payment. Credits
// are added by School Compliance once paid (lib/creditRequests).
export async function GET(req: NextRequest) {
  const session = await requirePermission(req, "manage_users");
  if (session instanceof NextResponse) return session;
  const [balance, users, pending] = await Promise.all([getCredits(), getUsers(), pendingCreditRequests()]);
  return NextResponse.json({
    balance,
    spenders: users
      .filter((u) => u.canSpendTranslationCredits)
      .map((u) => ({ id: u.id, name: `${u.name} ${u.surname}`.trim(), email: u.email })),
    pending: pending.map((r) => ({
      id: r.id,
      credits: r.credits,
      amountRand: r.amountRand,
      reference: r.reference,
      requestedBy: r.requestedBy.name,
      requestedAt: r.requestedAt,
    })),
  });
}
