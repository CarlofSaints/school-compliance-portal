import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { getUsers } from "@/lib/userData";
import { getCredits } from "@/lib/contentTranslation";

// The school's own view of its translation credits: the balance, and who is
// ticked to spend them. Read only: credits are added by School Compliance
// once paid (lib/contentTranslation, /platform/<key>).
export async function GET(req: NextRequest) {
  const session = await requirePermission(req, "manage_users");
  if (session instanceof NextResponse) return session;
  const [balance, users] = await Promise.all([getCredits(), getUsers()]);
  return NextResponse.json({
    balance,
    spenders: users
      .filter((u) => u.canSpendTranslationCredits)
      .map((u) => ({ id: u.id, name: `${u.name} ${u.surname}`.trim(), email: u.email })),
  });
}
