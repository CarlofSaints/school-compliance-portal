import { NextRequest, NextResponse } from "next/server";
import { pause } from "@/lib/actionItemNotify";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { isEmailConfigured, sendCredentialsSetupEmail } from "@/lib/email";
import { RESET_TTL_MS, createResetToken } from "@/lib/passwordReset";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { requirePermission } from "@/lib/rolesData";
import { getUsers, updateUsersWhere } from "@/lib/userData";

export const maxDuration = 300;
const BATCH = 200;

// Emails staff who have never signed in a link to set their password, once each.
// Each person is stamped, so pressing again carries on with the rest.
export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_users");
  if (session instanceof NextResponse) return session;
  const limited = await enforce([[LIMITS.emailSendUser, session.id]]);
  if (limited) return limited;
  if (!isEmailConfigured()) return NextResponse.json({ error: "Email is not configured on this site." }, { status: 503 });

  const waiting = (await getUsers()).filter((u) => u.staff && u.forcePasswordChange && !u.staff.invitedAt && !u.retiredAt && !u.termLocked);
  const minutes = Math.round(RESET_TTL_MS / 60000);
  const sent = new Set<string>();
  const failed: string[] = [];
  try {
    for (const u of waiting.slice(0, BATCH)) {
      const ok = await sendCredentialsSetupEmail(u.email, u.name, createResetToken(u), minutes).catch(() => false);
      if (ok) sent.add(u.id);
      else failed.push(`${u.name} ${u.surname}`.trim());
      await pause();
    }
  } finally {
    const at = new Date().toISOString();
    if (sent.size) await updateUsersWhere((u) => (sent.has(u.id) && u.staff ? { staff: { ...u.staff, invitedAt: at } } : null));
  }
  await recordActivity({ ...actorFrom(req, session), action: "staff.invited", entity: "user", entityId: "staff", summary: `Emailed ${sent.size} staff a link to set their password` });
  return NextResponse.json({ sent: sent.size, failed, left: Math.max(0, waiting.length - sent.size - failed.length) });
}
