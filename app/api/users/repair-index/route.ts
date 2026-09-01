import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { repairUserIndex } from "@/lib/userData";

export const dynamic = "force-dynamic";

// Puts back any account that exists in storage but has fallen out of the user
// list, by rebuilding the list from each user's own copy.
//
// It only ever ADDS: an account already in the list is left untouched, a
// deleted one is skipped by its tombstone, and one whose email has since been
// taken by somebody else is left out rather than creating two logins for one
// address. So it is safe to run at any time, and does nothing when there is
// nothing to fix.
export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_users");
  if (session instanceof NextResponse) return session;

  try {
    const { restored, backfilled, scanned } = await repairUserIndex();
    return NextResponse.json(
      { restored, backfilled, scanned, count: restored.length },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("User index repair failed:", err);
    return NextResponse.json(
      { error: "The user list could not be rebuilt." },
      { status: 500 }
    );
  }
}
