import { NextRequest, NextResponse } from "next/server";
import { requirePermission, SUPER_ADMIN_ROLE_ID } from "@/lib/rolesData";
import crypto from "crypto";
import { getUserById, updateUser } from "@/lib/userData";
import { getMfa, deleteMfa } from "@/lib/mfa";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom, afterResponse } from "@/lib/activityActor";
import { ipOf } from "@/lib/rateLimit";

// Reset MFA: for a Super Admin who lost their phone and their backup codes.
// 🔴 Super Admin only, not manage_users: someone who could reset it and also
// knew the password could put their own phone on the account.
//
// It also replaces their password with a random one nobody knows. Sessions
// are signed against the password hash, so that signs out every device,
// including a stolen phone that was signed in. They come back through
// Forgot your password? (their own email) and set the app up again.
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
    await updateUser(id, { password: crypto.randomBytes(32).toString("base64url") });
    const at = new Date().toISOString();
    await afterResponse(() =>
      recordActivity({
        at,
        ...actorFrom(req, session),
        ip: ipOf(req),
        action: "auth.mfa_reset",
        entity: "user",
        entityId: id,
        summary: `Reset two-step sign-in for ${user.name} ${user.surname} and signed them out everywhere`.trim(),
      })
    );
  }
  return NextResponse.json({ wasSetUp });
}
