import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { JonoError, askJono, cleanTurns } from "@/lib/askJono";
import { getLocale } from "@/lib/i18n/server";

export const maxDuration = 120;

// Ask Jono. Any signed-in person may ask; what Jono can see is limited to what
// they may see (lib/askJono.ts). The question itself is not stored or logged:
// people will ask about sensitive matters.
export async function POST(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  const limited = await enforce([[LIMITS.jonoUser, session.id], [LIMITS.jonoSchool, "school"]]);
  if (limited) return limited;

  const turns = cleanTurns((await req.json().catch(() => ({}))).messages);
  if (!turns) return NextResponse.json({ error: "Type a question first." }, { status: 400 });

  try {
    return NextResponse.json({ answer: await askJono(session, turns, await getLocale()) });
  } catch (err) {
    if (err instanceof JonoError) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error("[jono] Failed:", err);
    return NextResponse.json({ error: "Jono could not answer just now. Please try again." }, { status: 500 });
  }
}
