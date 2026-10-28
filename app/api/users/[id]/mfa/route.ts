import { NextRequest, NextResponse } from "next/server";
import { requirePermission, SUPER_ADMIN_ROLE_ID } from "@/lib/rolesData";
import { getUserById } from "@/lib/userData";
import { getMfa, deleteMfa } from "@/lib/mfa";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom, afterResponse } from "@/lib/activityActor";
import { ipOf } from "@/lib/rateLimit";

// Reset MFA: for a Super Admin who lost their phone and their backup codes.
// They set it up again at their next sign-in. 🔴 Super Admin only, not
// manage_users: someone who could reset it and also knew the password could
// put their own phone on the account.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(req, "manage_users");
  if (session instanceof NextResponse) return session;
  if (session.role !== SUPER_ADMIN_ROLE_ID) {
    return NextResponse.json({ error: "Only a Super Admin can reset two-step sign-in." }, { status: 403 });
  }

  const { id } = await params;
  const user = await getUserById(id);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const wasSetUp = !!(await getMfa(id));
  if (wasSetUp) {
    await deleteMfa(id);
    const at = new Date().toISOString();
    await afterResponse(() =>
      recordActivity({
        at,
        ...actorFrom(req, session),
        ip: ipOf(req),
        action: "auth.mfa_reset",
        entity: "user",
        entityId: id,
        summary: `Reset two-step sign-in for ${user.name} ${user.surname}`.trim(),
      })
    );
  }
  return NextResponse.json({ wasSetUp });
}
