import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platformAdmin";
import { revokeCode, deleteUnusedCode, normaliseCode } from "@/lib/platformCodes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Revoke, or delete.
 *
 * 🔴 REVOKE is the default and DELETE is the exception. A code somebody has
 * already redeemed must stay on record: in six months, "why did this school
 * pay R1,312.50?" has to have an answer, and a deleted code cannot give one.
 * Deleting is only allowed for a code created by mistake that nobody has used,
 * and lib/platformCodes.ts enforces that rather than trusting this route.
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> }
) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;

  const { code: raw } = await ctx.params;
  const code = normaliseCode(raw);
  const hard = new URL(req.url).searchParams.get("hard") === "1";

  try {
    if (hard) {
      const gone = await deleteUnusedCode(code);
      if (!gone) {
        return NextResponse.json(
          {
            error:
              "That code has been used, so it can only be revoked, not deleted.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ deleted: true });
    }

    const revoked = await revokeCode(code);
    if (!revoked) {
      return NextResponse.json({ error: "No code by that name." }, { status: 404 });
    }
    return NextResponse.json({ code: revoked });
  } catch (err) {
    console.error("[platform/codes] revoke failed:", err);
    return NextResponse.json({ error: "Could not update the code." }, { status: 500 });
  }
}
