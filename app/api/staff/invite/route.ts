import { NextRequest, NextResponse } from "next/server";
import { pause } from "@/lib/actionItemNotify";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";
import { isEmailConfigured, sendCredentialsSetupEmail } from "@/lib/email";
import { RESET_TTL_MS, createResetToken } from "@/lib/passwordReset";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { requirePermission } from "@/lib/rolesData";
import { awaitingLink } from "@/lib/staffData";
import { getUsers, updateUsersWhere } from "@/lib/userData";

export const maxDuration = 300;
const BATCH = 150;
const STAMP_EVERY = 20;
const STOP_AFTER_MS = 240_000;

// Emails staff who have never signed in a link to set their password, once each.
// Each person is stamped, so pressing again carries on with the rest.
export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_users");
  if (session instanceof NextResponse) return session;
  const limited = await enforce([[LIMITS.emailSendUser, session.id]]);
  if (limited) return limited;
  if (!isEmailConfigured()) return NextResponse.json({ error: "Email is not configured on this site." }, { status: 503 });

  const waiting = (await getUsers()).filter(awaitingLink);
  const minutes = Math.round(RESET_TTL_MS / 60000);
  const started = Date.now();
  let sent = 0;
  let unstamped = new Set<string>();
  const failed: string[] = [];
  // Stamped as it goes: if the platform stops this, the next press mails at most a few people twice.
  const stamp = async () => {
    const ids = unstamped;
    unstamped = new Set();
    const at = new Date().toISOString();
    if (ids.size) await updateUsersWhere((u) => (ids.has(u.id) && u.staff ? { staff: { ...u.staff, invitedAt: at } } : null));
  };
  for (const u of waiting.slice(0, BATCH)) {
    if (Date.now() - started > STOP_AFTER_MS) break;
    const ok = await sendCredentialsSetupEmail(u.email, u.name, createResetToken(u), minutes).catch(() => false);
    if (ok) {
      sent++;
      unstamped.add(u.id);
    } else failed.push(`${u.name} ${u.surname}`.trim());
    if (unstamped.size >= STAMP_EVERY) await stamp();
    await pause();
  }
  await stamp();
  await recordActivity({ ...actorFrom(req, session), action: "staff.invited", entity: "user", entityId: "staff", summary: `Emailed ${sent} staff a link to set their password` });
  return NextResponse.json({ sent, failed, left: Math.max(0, waiting.length - sent - failed.length) });
}
