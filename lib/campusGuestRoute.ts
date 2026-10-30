import { NextRequest, NextResponse } from "next/server";
import { LIMITS, enforce, ipOf } from "./rateLimit";
import { guestFromRequest, guestLearner, usableLink, type Guest, type ShareLink } from "./campusShare";
import type { Learner } from "./trainingLearner";

/** For a guest route: the link, the guest and their learner, or the response to send instead. */
export async function guestContext(
  req: NextRequest,
  token: string
): Promise<{ link: ShareLink; guest: Guest; learner: Learner } | NextResponse> {
  const limited = await enforce([[LIMITS.campusGuestUse, ipOf(req)]]);
  if (limited) return limited;
  const link = await usableLink(token);
  if (!link) return NextResponse.json({ error: "This link has expired or been switched off." }, { status: 404 });
  const guest = await guestFromRequest(req, token);
  if (!guest) return NextResponse.json({ error: "Give your name first." }, { status: 401 });
  return { link, guest, learner: await guestLearner(link, guest) };
}
