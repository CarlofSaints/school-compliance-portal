import { NextRequest, NextResponse } from "next/server";
import { isAiOutOfCredit } from "@/lib/aiErrors";
import { requireLogin } from "@/lib/rolesData";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { JonoError, askJono, cleanTurns, estimateJonoTokens, JONO_MAX_OUTPUT } from "@/lib/askJono";
import { getLocale } from "@/lib/i18n/server";
import { freeHowTo } from "@/lib/jonoFree";
import { jonoCharging, quoteCredits, creditsForUsd, usdCost, tenth } from "@/lib/jonoBilling";
import { getCredits, spendCredits, addCredits, maySpendCredits } from "@/lib/contentTranslation";

export const maxDuration = 120;

// Ask Jono. Any signed-in person may ask; what Jono can see is limited to what
// they may see (lib/askJono.ts). The question itself is not stored or logged:
// people will ask about sensitive matters.
//
// Carl: free when it can answer without the AI; otherwise say it needs credits
// first, and say so plainly when there are none.
//   1. A "how do I..." the Guide answers -> free, no AI (lib/jonoFree.ts).
//   2. Before JONO_CHARGING_FROM -> the AI answers free, as it always has.
//   3. From then: without {confirm:true}, reply with the quote (needsCredits).
//      With it: take the quote, ask, then give back everything above the ACTUAL
//      cost (lib/jonoBilling.ts). A failed answer gives it all back.
export async function POST(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => ({}));
  // Checked before the limits, so a malformed call never uses up the school's questions.
  const turns = cleanTurns(body.messages);
  if (!turns) return NextResponse.json({ error: "Type a question first." }, { status: 400 });
  const locale = await getLocale();

  // 1. Free from the Guide (the latest question only; "Ask the AI instead" skips it).
  if (body.forceAi !== true) {
    const free = freeHowTo(String(turns[turns.length - 1].content), locale);
    if (free) return NextResponse.json({ answer: free, free: true });
  }

  const limited = await enforce([[LIMITS.jonoUser, session.id], [LIMITS.jonoSchool, "school"]]);
  if (limited) return limited;

  const buyUrl = session.permissions.includes("manage_users") ? "/admin/translation-credits" : "/billing";
  let held = 0; // credits taken for this answer, given back if it fails
  try {
    if (!jonoCharging()) {
      const { text } = await askJono(session, turns, locale);
      return NextResponse.json({ answer: text });
    }

    // 3. Priced before it runs.
    const quote = quoteCredits(await estimateJonoTokens(session, turns, locale), JONO_MAX_OUTPUT);
    const [balance, canSpend] = await Promise.all([getCredits(), maySpendCredits(session.id)]);
    if (body.confirm !== true || !canSpend || balance < quote) {
      return NextResponse.json({ needsCredits: true, quote, balance, canSpend, buyUrl });
    }
    if (!(await spendCredits(quote))) {
      return NextResponse.json({ needsCredits: true, quote, balance: await getCredits(), canSpend, buyUrl });
    }
    held = quote;
    const { text, usage } = await askJono(session, turns, locale);
    const charged = Math.min(quote, creditsForUsd(usdCost(usage)));
    held = 0;
    // The difference back. The answer stands even if this hiccups (logged).
    const back = tenth(quote - charged);
    const after = back > 0 ? (await addCredits(back).catch((e) => (console.error("[jono] refund failed:", back, e), null)))?.balance ?? null : await getCredits().catch(() => null);
    return NextResponse.json({ answer: text, charged, balance: after });
  } catch (err) {
    if (held > 0) await addCredits(held).catch((e) => console.error("[jono] refund after failure failed:", held, e));
    if (err instanceof JonoError) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error("[jono] Failed:", err);
    // Said plainly, with the page to report it on: "try again" never helps here.
    if (isAiOutOfCredit(err)) {
      return NextResponse.json({ error: "out-of-ai-credit", code: "out-of-ai-credit" }, { status: 503 });
    }
    return NextResponse.json({ error: "Jono could not answer just now. Please try again." }, { status: 500 });
  }
}
